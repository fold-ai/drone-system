"""3-DOF point-mass flight dynamics. Fixed-step RK4, output decimated to 50 Hz.

States integrated in free flight:
    V     true airspeed                m/s
    gam   flight-path angle            rad
    h     altitude                     m
    xe,ye ground position (east,north) m
    sg    ground path length           m
    mf    fuel mass                    kg
    thr   ACTUAL throttle (spooled)    -
    psi   heading                      rad

Commanded throttle and actual throttle are separate states; the first-order
spool lag between them is visible in the output.

Wind acts on the ground track only - the dynamics are written in the air-mass
frame, which is where the aerodynamics and the engine live.

The only quantity limited anywhere in this loop is lift, held to CL_max because
the wing physically cannot make more. Every limit is reported: `lift_limited`
marks a clipped manoeuvre command, `stall_limited` marks the stronger condition
that the aircraft cannot hold 1 g at its current speed. Nothing is smoothed,
tuned or curve-fitted toward a nicer answer.
"""
from __future__ import annotations

import math
import time
from typing import List, Optional, Tuple


def steps_remaining(duration: float, t: float) -> bool:
    return duration - t > 1e-9

from .aero import cd0_of_mach
from .derived import derive
from .atmosphere import isa
from .constants import (G0, GAMMA_AIR, H_TROPO, ISA_EXP, LAPSE, P0_ISA, P_TROPO,
                        R_AIR, RHO0_ISA, T0_ISA, T_TROPO)
from .launch import feasibility as launch_feasibility
from .launch import run_rail
from .mission import (eval_schedule, fill_grids, resolve_profile, size_mission)
from .performance import mach1_deficit, mach_sweep
from .schema import (FlightEvent, MissionSpec, SimulationResult, Trajectory,
                     TrajectorySummary)

_exp, _sqrt, _sin, _cos, _asin, _tanh = (
    math.exp, math.sqrt, math.sin, math.cos, math.asin, math.tanh)

_GAMMA_R = GAMMA_AIR * R_AIR
_INV_T0 = 1.0 / T0_ISA
_STRAT_K = G0 / (R_AIR * T_TROPO)

COLUMNS = [
    "t", "x_m", "y_m", "s_ground_m", "h_m", "v_tas_ms", "v_ground_ms", "mach",
    "gamma_deg", "psi_deg", "bank_deg", "roc_ms", "mass_kg", "fuel_kg",
    "fuel_flow_kgs", "throttle_cmd", "throttle_act", "thrust_n", "drag_n",
    "lift_n", "thrust_margin_n", "ps_ms", "cl", "cd", "cd0", "cdi", "cd_wave",
    "ld", "q_pa", "load_factor", "rho", "a_sound_ms", "temp_k", "press_pa",
    "reynolds", "x_cg_m", "static_margin", "wave_drag_active", "stall_limited",
    "lift_limited", "phase",
]
_INT_COLUMNS = {"wave_drag_active", "stall_limited", "lift_limited", "phase"}
# Output precision per column: enough to be lossless at instrument resolution,
# no more, because 15 000 samples x 41 columns crosses the wire on every solve.
_PRECISION = {
    "cl": 6, "cd": 6, "cd0": 6, "cdi": 6, "cd_wave": 6, "mach": 5,
    "throttle_cmd": 5, "throttle_act": 5, "fuel_kg": 5, "fuel_flow_kgs": 7,
    "static_margin": 5, "x_cg_m": 5, "rho": 5, "load_factor": 4, "ld": 4,
}
_DEFAULT_PRECISION = 3


def simulate(spec: MissionSpec) -> SimulationResult:
    t0_wall = time.perf_counter()
    warnings: List[str] = []
    events: List[FlightEvent] = []

    af, eng, atm, ls, mp, ctl, itg = (spec.airframe, spec.engine, spec.atmosphere,
                                      spec.launch, spec.mission, spec.control,
                                      spec.integration)
    d_isa = atm.delta_isa_k
    wind = atm.headwind_ms
    h_ground = atm.ground_altitude_m
    S = af.wing_area_m2
    k_ind = af.k_induced
    cl_max = af.cl_max
    cd0_sub, m_dd, dcd_w, w_width = af.cd0_sub, af.mach_dd, af.dcd_wave, af.wave_width
    dry = af.mass_dry_kg
    mac = af.mac_m
    theta = math.radians(ls.rail_angle_deg)

    # Rail exit altitude is pure geometry, so sizing does not have to wait on the
    # rail integration.
    h_exit = h_ground + ls.rail_length_m * math.sin(theta)

    # ---------------- fuel sizing and mission timeline ------------------
    fuel, plan = size_mission(spec, h_exit)
    resolved = resolve_profile(spec, plan)
    fuel_loaded = fuel.fuel_loaded_kg
    if not fuel.feasible or fuel.note:
        if fuel.note:
            warnings.append(fuel.note)
    if plan.climb_limited:
        warnings.append(f"Commanded climb rate {mp.climb_rate_ms:.0f} m/s is not sustainable "
                        f"through the whole climb at full throttle.")

    # ---------------- rail phase ----------------------------------------
    rail = run_rail(spec, fuel_loaded, record=True)
    lf = launch_feasibility(spec, fuel_loaded)
    bare = run_rail(spec, fuel_loaded, booster_thrust_override=0.0, booster_burn_override=0.0)
    if not lf.feasible:
        warnings.append(lf.note)
    if bare.v_exit < lf.v_required_ms:
        warnings.append(
            f"Engine thrust alone gives {bare.v_exit:.1f} m/s at rail exit against "
            f"{lf.v_required_ms:.1f} m/s required. A RATO booster is mandatory for this "
            f"airframe on a {ls.rail_length_m:.1f} m rail.")

    b = ls.booster
    b_on = b.enabled and b.thrust_n > 0.0
    b_burn = b.burn_time_s if b_on else 0.0
    b_mass = b.mass_kg if b_on else 0.0

    # ---------------- schedules on a half-dt index grid ------------------
    dt = itg.dt
    half = 0.5 * dt
    duration = plan.duration_s
    alt_nodes = resolved.altitude_schedule
    thr_nodes = resolved.throttle_schedule
    hdg_nodes = ctl.heading_schedule
    turning = bool(hdg_nodes) and len(hdg_nodes) > 1

    n_half = int(duration / half) + 8
    HCMD, ROCFF = fill_grids(alt_nodes, n_half, half)
    TCMD, _ = fill_grids(thr_nodes, n_half, half, lo=0.0, hi=1.0)
    if turning:
        _, psid_deg = fill_grids(hdg_nodes, n_half, half)
        PSID = [math.radians(v) for v in psid_deg]
    else:
        PSID = [0.0] * n_half
    FB = [0.0] * n_half
    MB = [0.0] * n_half
    if b_on:
        n_burn = min(n_half, int(b_burn / half) + 1)
        for i in range(n_burn):
            FB[i] = b.thrust_n
            MB[i] = b_mass
        if not b.jettison:
            for i in range(n_burn, n_half):
                MB[i] = b_mass

    k_gam, k_alt, n_max = ctl.k_gamma, ctl.k_alt, ctl.n_max
    ve, mdot0, ram_k, ram_clamp = eng.ve, eng.mdot_0, eng.ram_k, eng.ram_mach_clamp
    idle, sp_exp = eng.idle_frac, eng.spool_exp
    tau_up, tau_dn = eng.tau_up_s, eng.tau_down_s
    tsfc_b, tsfc_k = eng.tsfc_base, eng.tsfc_throttle_k
    inv_rho0 = 1.0 / RHO0_ISA
    inv_3600 = 1.0 / 3600.0

    # ---------------- derivative -----------------------------------------
    def rhs(i, V, gam, h, xe, ye, sg, mf, thr, psi):
        ha = h if h > -500.0 else -500.0
        if ha < H_TROPO:
            t_std = T0_ISA - LAPSE * ha
            p = P0_ISA * (t_std * _INV_T0) ** ISA_EXP
        else:
            t_std = T_TROPO
            p = P_TROPO * _exp(-_STRAT_K * (ha - H_TROPO))
        Tk = t_std + d_isa
        rho = p / (R_AIR * Tk)
        a = _sqrt(_GAMMA_R * Tk)
        Vs = V if V > 0.5 else 0.5
        M = Vs / a
        m = dry + mf + MB[i]

        if mf > 0.0:
            d = 0.0 if thr < 0.0 else (1.0 if thr > 1.0 else thr)
            mc = M if M < ram_clamp else ram_clamp
            mdot = (mdot0 * (rho * inv_rho0) * (idle + (1.0 - idle) * d ** sp_exp)
                    * _sqrt(1.0 + ram_k * mc * mc))
            Tn = mdot * (ve - V)
            wf = tsfc_b * (1.0 + tsfc_k * (1.0 - d)) * inv_3600 * (Tn if Tn > 0.0 else 0.0)
        else:
            Tn = 0.0
            wf = 0.0
        Tn += FB[i]

        cg_ = _cos(gam)
        sg_ = _sin(gam)
        r = (ROCFF[i] + k_alt * (HCMD[i] - h)) / Vs
        if r > 0.985:
            r = 0.985
        elif r < -0.985:
            r = -0.985
        Lv = m * (Vs * k_gam * (_asin(r) - gam) + G0 * cg_)
        q = 0.5 * rho * Vs * Vs
        qs = q * S
        if qs < 1e-6:
            qs = 1e-6
        lmax = cl_max * qs
        nlim = n_max * m * G0
        if lmax > nlim:
            lmax = nlim

        if turning:
            Ll = m * Vs * PSID[i] * cg_
            Lmag = _sqrt(Lv * Lv + Ll * Ll)
            if Lmag > lmax:
                f = lmax / Lmag
                Lv *= f
                Ll *= f
                Lmag = lmax
            cgl = cg_ if cg_ > 0.15 else 0.15
            psidot = Ll / (m * Vs * cgl)
            cp, spx = _cos(psi), _sin(psi)
            vx = V * cg_ * cp - wind
            vy = V * cg_ * spx
            vg = _sqrt(vx * vx + vy * vy)
        else:
            Lmag = Lv if Lv >= 0.0 else -Lv
            if Lmag > lmax:
                Lv = lmax if Lv >= 0.0 else -lmax
                Lmag = lmax
            psidot = 0.0
            vx = V * cg_ - wind
            vy = 0.0
            vg = vx if vx >= 0.0 else -vx

        cl = Lmag / qs
        cd = cd0_sub + dcd_w * 0.5 * (1.0 + _tanh((M - m_dd) / w_width)) + k_ind * cl * cl
        tc = TCMD[i]
        return ((Tn - cd * qs) / m - G0 * sg_,
                (Lv - m * G0 * cg_) / (m * Vs),
                V * sg_, vx, vy, vg, -wf,
                (tc - thr) / (tau_up if tc > thr else tau_dn), psidot)

    # ---------------- diagnostic probe (recorded samples only) -----------
    def probe(t, i, V, gam, h, xe, ye, sg, mf, thr, psi):
        atmo = isa(h if h > -500.0 else -500.0, d_isa)
        rho, a, Tk, p, mu = atmo.rho, atmo.a_ms, atmo.temp_k, atmo.press_pa, atmo.mu
        Vs = V if V > 0.5 else 0.5
        M = Vs / a
        mb = MB[i]
        m = dry + mf + mb
        Tn = eng.net_thrust(rho, M, V, thr, mf > 0.0)
        wf = eng.fuel_flow(Tn, thr)
        Tn += FB[i]
        cg_, sg_ = _cos(gam), _sin(gam)
        r = max(-0.985, min(0.985, (ROCFF[i] + k_alt * (HCMD[i] - h)) / Vs))
        Lv = m * (Vs * k_gam * (_asin(r) - gam) + G0 * cg_)
        Ll = m * Vs * PSID[i] * cg_ if turning else 0.0
        q = 0.5 * rho * Vs * Vs
        qs = max(1e-6, q * S)
        lmax = min(cl_max * qs, n_max * m * G0)
        Lmag = _sqrt(Lv * Lv + Ll * Ll)
        lift_lim = 0
        if Lmag > lmax:
            f = lmax / Lmag
            Lv *= f
            Ll *= f
            Lmag = lmax
            lift_lim = 1
        # true stall: 1 g equilibrium at this speed is beyond CL_max
        stall = 1 if (m * G0 * abs(cg_)) > cl_max * qs else 0
        cl = Lmag / qs
        wave = dcd_w * 0.5 * (1.0 + _tanh((M - m_dd) / w_width))
        cd0 = cd0_sub + wave
        cdi = k_ind * cl * cl
        cd = cd0 + cdi
        D = cd * qs
        W = m * G0
        if turning:
            cp, spx = _cos(psi), _sin(psi)
            vx, vy = V * cg_ * cp - wind, V * cg_ * spx
        else:
            vx, vy = V * cg_ - wind, 0.0
        vg = _sqrt(vx * vx + vy * vy)
        bank = math.degrees(math.atan2(Ll, Lv)) if abs(Ll) > 1e-9 else 0.0
        x_cg = af.cg(mf, mb, b.x_booster_m)
        roc_ff = ROCFF[i]
        phase = 0 if t < rail.t_exit else (1 if roc_ff > 0.5 else (3 if roc_ff < -0.5 else 2))
        return (t, xe, ye, sg, h, V, vg, M, math.degrees(gam), math.degrees(psi) % 360.0,
                bank, V * sg_, m, mf, wf, TCMD[i], thr, Tn, D, Lmag, Tn - D,
                V * (Tn - D) / W if W > 0 else 0.0, cl, cd, cd0, cdi, wave,
                (cl / cd if cd > 0 else 0.0), q, Lmag / W if W > 0 else 0.0,
                rho, a, Tk, p, (rho * V * mac / mu if mu > 0 else 0.0), x_cg,
                (af.x_np_m - x_cg) / mac, 1 if M > m_dd else 0, stall, lift_lim, phase)

    rows: List[tuple] = []
    rec_dt = 1.0 / itg.output_hz
    resume = spec.resume

    # ---------------- rail samples onto the output grid ------------------
    if resume is None:
        next_rec = 0.0
        rs = rail.samples
        if rs:
            j = 0
            while next_rec <= rail.t_exit + 1e-12:
                while j + 1 < len(rs) and rs[j + 1][0] < next_rec:
                    j += 1
                t_s, s_s, v_s, tn_s, fb_s, a_s, m_s = rs[min(j, len(rs) - 1)]
                h_s = h_ground + s_s * math.sin(theta)
                atmo = isa(h_s, d_isa)
                M_s = v_s / atmo.a_ms
                q_s = 0.5 * atmo.rho * v_s * v_s
                wave = dcd_w * 0.5 * (1.0 + _tanh((M_s - m_dd) / w_width))
                cd0 = cd0_sub + wave
                D_s = cd0 * q_s * S
                mb_s = b_mass if (b_on and (t_s < b_burn or not b.jettison)) else 0.0
                mf_s = max(0.0, m_s - dry - mb_s)
                W_s = m_s * G0
                x_cg = af.cg(mf_s, mb_s, b.x_booster_m)
                rows.append((
                    next_rec, s_s * math.cos(theta), 0.0, s_s * math.cos(theta), h_s, v_s,
                    max(0.0, v_s * math.cos(theta) - wind), M_s, ls.rail_angle_deg, 0.0, 0.0,
                    v_s * math.sin(theta), m_s, mf_s, eng.fuel_flow(tn_s, 1.0), 1.0,
                    1.0 if ls.engine_prespooled else 0.0, tn_s + fb_s, D_s, 0.0,
                    tn_s + fb_s - D_s, v_s * (tn_s + fb_s - D_s) / W_s, 0.0, cd0, cd0, 0.0,
                    wave, 0.0, q_s, 0.0, atmo.rho, atmo.a_ms, atmo.temp_k, atmo.press_pa,
                    (atmo.rho * v_s * mac / atmo.mu if atmo.mu > 0 else 0.0), x_cg,
                    (af.x_np_m - x_cg) / mac, 1 if M_s > m_dd else 0, 0, 0, 0))
                next_rec += rec_dt

        events.append(FlightEvent(0.0, "release", "Rail release", "info",
                                  f"Gross {lf.gross_mass_kg:.2f} kg on a {ls.rail_length_m:.1f} m "
                                  f"rail at {ls.rail_angle_deg:.0f} deg."))
        events.append(FlightEvent(rail.t_exit, "rail_exit", f"Rail exit {rail.v_exit:.1f} m/s",
                                  "info" if lf.feasible else "alert", lf.note))
        if b_on:
            events.append(FlightEvent(min(b_burn, duration), "booster_burnout", "Booster burnout",
                                      "info", f"{b.thrust_n / 1000.0:.2f} kN for "
                                              f"{b_burn * 1000:.0f} ms = {b.thrust_n * b_burn:.0f} N s."))
            if b.jettison:
                events.append(FlightEvent(min(b_burn, duration), "booster_jettison",
                                          "Booster jettison", "info", f"{b.mass_kg:.2f} kg released."))
        V, gam, h = rail.v_exit, theta, rail.h_exit
        xe = rail.s * math.cos(theta)
        ye = 0.0
        sg = xe
        mf = max(0.0, fuel_loaded - rail.fuel_burned)
        thr = 1.0 if ls.engine_prespooled else 0.0
        psi = 0.0
        t = rail.t_exit
    else:
        V, gam, h = resume.v_tas_ms, math.radians(resume.gamma_deg), resume.h_m
        xe, ye, sg = resume.x_m, resume.y_m, resume.s_ground_m
        mf, thr, psi = resume.fuel_kg, resume.throttle_act, math.radians(resume.psi_deg)
        t = resume.t
        next_rec = (math.floor(t / rec_dt + 1e-9) + 1) * rec_dt

    # ---------------- free flight ----------------------------------------
    # The rail ends at an arbitrary time. Take one short step to put the clock on
    # the integration grid so every recorded sample lands exactly on the 50 Hz
    # output grid instead of drifting up to one step late.
    t_aligned = math.ceil(t / dt - 1e-9) * dt
    dt_first = t_aligned - t
    if dt_first > 1e-12 and steps_remaining(duration, t):
        i = int(round(t / half))
        hf = 0.5 * dt_first
        k1 = rhs(i, V, gam, h, xe, ye, sg, mf, thr, psi)
        k2 = rhs(i, V + hf * k1[0], gam + hf * k1[1], h + hf * k1[2], xe + hf * k1[3],
                 ye + hf * k1[4], sg + hf * k1[5], mf + hf * k1[6], thr + hf * k1[7],
                 psi + hf * k1[8])
        k3 = rhs(i, V + hf * k2[0], gam + hf * k2[1], h + hf * k2[2], xe + hf * k2[3],
                 ye + hf * k2[4], sg + hf * k2[5], mf + hf * k2[6], thr + hf * k2[7],
                 psi + hf * k2[8])
        k4 = rhs(i + 1, V + dt_first * k3[0], gam + dt_first * k3[1], h + dt_first * k3[2],
                 xe + dt_first * k3[3], ye + dt_first * k3[4], sg + dt_first * k3[5],
                 mf + dt_first * k3[6], thr + dt_first * k3[7], psi + dt_first * k3[8])
        cc = dt_first / 6.0
        V += cc * (k1[0] + 2.0 * (k2[0] + k3[0]) + k4[0])
        gam += cc * (k1[1] + 2.0 * (k2[1] + k3[1]) + k4[1])
        h += cc * (k1[2] + 2.0 * (k2[2] + k3[2]) + k4[2])
        xe += cc * (k1[3] + 2.0 * (k2[3] + k3[3]) + k4[3])
        ye += cc * (k1[4] + 2.0 * (k2[4] + k3[4]) + k4[4])
        sg += cc * (k1[5] + 2.0 * (k2[5] + k3[5]) + k4[5])
        mf += cc * (k1[6] + 2.0 * (k2[6] + k3[6]) + k4[6])
        thr += cc * (k1[7] + 2.0 * (k2[7] + k3[7]) + k4[7])
        psi += cc * (k1[8] + 2.0 * (k2[8] + k3[8]) + k4[8])
        if mf < 0.0:
            mf = 0.0
    t = t_aligned
    if t >= next_rec - 1e-9:
        rows.append(probe(next_rec, int(round(t / half)), V, gam, h, xe, ye, sg, mf, thr, psi))
        next_rec += rec_dt
    t_base = t
    i0 = int(round(t / half))
    steps = int(round((duration - t) / dt))
    if steps < 0:
        steps = 0
    target_m = mp.mission_distance_km * 1000.0

    max_mach = max_v = max_h = max_q = max_n = 0.0
    min_sm = 1e9
    best_ld = 0.0
    wave_in = stalled = lift_lim_any = flame = impact = target_hit = False
    t_cruise = -1.0
    termination = "end_of_run"
    n2 = n_half - 3

    for k in range(steps):
        i = i0 + 2 * k
        if i > n2:
            i = n2
        ib = i + 1
        k1 = rhs(i, V, gam, h, xe, ye, sg, mf, thr, psi)
        k2 = rhs(ib, V + half * k1[0], gam + half * k1[1], h + half * k1[2],
                 xe + half * k1[3], ye + half * k1[4], sg + half * k1[5],
                 mf + half * k1[6], thr + half * k1[7], psi + half * k1[8])
        k3 = rhs(ib, V + half * k2[0], gam + half * k2[1], h + half * k2[2],
                 xe + half * k2[3], ye + half * k2[4], sg + half * k2[5],
                 mf + half * k2[6], thr + half * k2[7], psi + half * k2[8])
        k4 = rhs(i + 2, V + dt * k3[0], gam + dt * k3[1], h + dt * k3[2],
                 xe + dt * k3[3], ye + dt * k3[4], sg + dt * k3[5],
                 mf + dt * k3[6], thr + dt * k3[7], psi + dt * k3[8])
        c = dt / 6.0
        V += c * (k1[0] + 2.0 * (k2[0] + k3[0]) + k4[0])
        gam += c * (k1[1] + 2.0 * (k2[1] + k3[1]) + k4[1])
        h += c * (k1[2] + 2.0 * (k2[2] + k3[2]) + k4[2])
        xe += c * (k1[3] + 2.0 * (k2[3] + k3[3]) + k4[3])
        ye += c * (k1[4] + 2.0 * (k2[4] + k3[4]) + k4[4])
        sg += c * (k1[5] + 2.0 * (k2[5] + k3[5]) + k4[5])
        mf += c * (k1[6] + 2.0 * (k2[6] + k3[6]) + k4[6])
        thr += c * (k1[7] + 2.0 * (k2[7] + k3[7]) + k4[7])
        psi += c * (k1[8] + 2.0 * (k2[8] + k3[8]) + k4[8])
        t = t_base + (k + 1) * dt      # accumulate from the step count, not by +=

        if mf <= 0.0:
            mf = 0.0
            if not flame:
                flame = True
                events.append(FlightEvent(t, "flameout", "Flameout - fuel exhausted", "alert",
                                          "Net thrust is zero from this point."))
        if V < 0.0:
            V = 0.0
        if h <= h_ground and itg.stop_on_ground:
            impact = True
            termination = "ground_impact"
            events.append(FlightEvent(t, "ground_impact", "Ground impact", "alert",
                                      f"Through launch elevation at {V:.0f} m/s, "
                                      f"{sg / 1000.0:.1f} km downrange."))

        if t >= next_rec - 1e-9:
            row = probe(t, i + 2, V, gam, h, xe, ye, sg, mf, thr, psi)
            rows.append(row)
            next_rec += rec_dt
            M = row[7]
            if M > max_mach:
                max_mach = M
            if V > max_v:
                max_v = V
            if h > max_h:
                max_h = h
            if row[28] > max_q:
                max_q = row[28]
            if row[29] > max_n:
                max_n = row[29]
            if row[27] > best_ld:
                best_ld = row[27]
            if row[37] and not wave_in:
                wave_in = True
                events.append(FlightEvent(t, "mach_dd_cross", f"Drag divergence at M {M:.3f}",
                                          "warn", f"M_dd = {m_dd:.2f}. Wave drag now active."))
            if row[38] and not stalled:
                stalled = True
                events.append(FlightEvent(t, "stall_onset", "Stall - 1 g flight unavailable",
                                          "alert", f"Airspeed {V:.0f} m/s at {h:.0f} m is below the "
                                                   f"1 g stall speed."))
            if row[39] and not lift_lim_any:
                lift_lim_any = True
                events.append(FlightEvent(t, "lift_limited", "Manoeuvre limited at CL_max", "warn",
                                          "Commanded flight path needs more lift than the wing "
                                          "can produce; the aircraft is tracking behind command."))
            if t_cruise < 0.0 and abs(h - mp.cruise_altitude_m) < 20.0:
                t_cruise = t
                events.append(FlightEvent(t, "top_of_climb", "Top of climb", "info",
                                          f"{h:.0f} m at {sg / 1000.0:.1f} km, "
                                          f"{mf:.2f} kg fuel remaining."))
            if (not target_hit) and sg >= target_m:
                target_hit = True
                events.append(FlightEvent(t, "target_range", "Mission distance reached", "info",
                                          f"{mp.mission_distance_km:.0f} km at t+{t:.0f} s, "
                                          f"{mf:.2f} kg fuel remaining."))
        if impact:
            break

    if not impact:
        events.append(FlightEvent(t, "end_of_run", "End of run", "info",
                                  f"{sg / 1000.0:.1f} km downrange, {h:.0f} m, {mf:.2f} kg fuel."))
    events.sort(key=lambda e: e.t)

    # ---------------- pack -----------------------------------------------
    if rows:
        min_sm = min(r[36] for r in rows)
    cols = list(zip(*rows)) if rows else [() for _ in COLUMNS]
    traj = Trajectory()
    _round = round
    for name, col in zip(COLUMNS, cols):
        if name in _INT_COLUMNS:
            setattr(traj, name, [int(v) for v in col])
        else:
            nd = _PRECISION.get(name, _DEFAULT_PRECISION)
            setattr(traj, name, [_round(v, nd) for v in col])

    if min_sm < af.static_margin_min:
        warnings.append(
            f"Static margin falls to {min_sm * 100.0:.1f}% MAC as the tank empties, below the "
            f"{af.static_margin_min * 100.0:.0f}% limit. Move the tank toward the neutral point "
            f"or re-station the payload.")
        events.append(FlightEvent(t, "cg_limit", "Static margin below limit", "warn",
                                  f"Minimum {min_sm * 100.0:.1f}% MAC."))
    miss = abs(sg - target_m)
    if not target_hit and mp.auto_fuel and target_m > 0 and miss > max(2000.0, 0.05 * target_m):
        warnings.append(
            f"Solver flew {sg / 1000.0:.1f} km against the {mp.mission_distance_km:.0f} km "
            f"requested. The sizing estimate and the integrated trajectory disagree by "
            f"{miss / 1000.0:.1f} km.")

    cruise_mass = dry + 0.5 * fuel_loaded
    m1 = mach1_deficit(af, eng, mp.cruise_altitude_m, cruise_mass, d_isa)
    sweep = mach_sweep(af, eng, mp.cruise_altitude_m, cruise_mass, d_isa)
    if m1.thrust_available_n < m1.thrust_required_n:
        warnings.append(m1.note)

    summary = TrajectorySummary(
        ok=True, solve_ms=(time.perf_counter() - t0_wall) * 1000.0, n_samples=len(rows),
        duration_s=t, gross_mass_kg=dry + fuel_loaded + b_mass,
        fuel_loaded_kg=fuel_loaded, fuel_burned_kg=fuel_loaded - mf, fuel_remaining_kg=mf,
        max_mach=max_mach, max_tas_ms=max_v, max_altitude_m=max_h, max_q_pa=max_q,
        max_load_factor=max_n, ground_range_km=sg / 1000.0, time_to_cruise_s=t_cruise,
        best_ld=best_ld, min_static_margin=(min_sm if min_sm < 1e8 else 0.0),
        wave_drag_entered=wave_in, stalled=stalled, flameout=flame, ground_impact=impact,
        target_range_met=target_hit, termination=termination, endurance_s=t)
    return SimulationResult(summary=summary, trajectory=traj, events=events, fuel=fuel,
                            launch=lf, mach1=m1, mach_sweep=sweep, resolved=resolved,
                            derived=derive(spec, fuel_loaded), spec=spec, warnings=warnings)
