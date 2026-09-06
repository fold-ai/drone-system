"""Rail launch: constrained slide, feasibility, and RATO booster sizing.

Rail phase is 1-DOF along the rail vector:

    m dV/dt = T_net + F_booster - D - m g sin(theta) - mu * N,   N = m g cos(theta)

Wing lift is taken as zero on the rail (the carriage carries the aircraft at low
incidence). That is the conservative choice: it maximises the normal reaction and
therefore the friction term.

Feasibility requires V_exit >= exit_margin * V_stall at the launch site.
"""
from __future__ import annotations

import math
from typing import List, Optional, Tuple

from .aero import cd0_of_mach, stall_speed
from .atmosphere import isa
from .constants import G0
from .engine import EngineProfile
from .schema import AirframeSpec, LaunchFeasibility, MissionSpec


class RailResult:
    __slots__ = ("v_exit", "t_exit", "h_exit", "s", "fuel_burned", "peak_accel",
                 "samples", "burnout_t")

    def __init__(self):
        self.v_exit = 0.0
        self.t_exit = 0.0
        self.h_exit = 0.0
        self.s = 0.0
        self.fuel_burned = 0.0
        self.peak_accel = 0.0
        self.samples: List[tuple] = []
        self.burnout_t: Optional[float] = None


def run_rail(spec: MissionSpec, fuel_kg: float, dt: float = 0.0002,
             record: bool = False, booster_thrust_override: Optional[float] = None,
             booster_burn_override: Optional[float] = None) -> RailResult:
    af, eng, ls = spec.airframe, spec.engine, spec.launch
    d_isa = spec.atmosphere.delta_isa_k
    h0 = spec.atmosphere.ground_altitude_m
    theta = math.radians(ls.rail_angle_deg)
    sin_t, cos_t = math.sin(theta), math.cos(theta)
    mu = ls.rail_friction_mu
    S = af.wing_area_m2
    dry = af.mass_dry_kg

    b = ls.booster
    b_thrust = booster_thrust_override if booster_thrust_override is not None else (b.thrust_n if b.enabled else 0.0)
    b_burn = booster_burn_override if booster_burn_override is not None else b.burn_time_s
    b_mass = b.mass_kg if (b.enabled or booster_thrust_override) else 0.0

    thr_cmd = 1.0
    thr = 1.0 if ls.engine_prespooled else 0.0

    res = RailResult()
    t = 0.0
    v = 0.0
    s = 0.0
    mf = fuel_kg
    L = ls.rail_length_m
    max_t = 30.0

    while s < L and t < max_t:
        h = h0 + s * sin_t
        atmo = isa(h, d_isa)
        mach = v / atmo.a_ms
        boosting = b_thrust > 0.0 and t < b_burn
        m = dry + mf + (b_mass if (b_thrust > 0.0 and (t < b_burn or not b.jettison)) else 0.0)
        tn = eng.net_thrust(atmo.rho, mach, v, thr, has_fuel=mf > 0.0)
        fb = b_thrust if boosting else 0.0
        q = 0.5 * atmo.rho * v * v
        drag = cd0_of_mach(af, mach) * q * S
        weight_comp = m * G0 * sin_t
        friction = mu * m * G0 * cos_t
        a = (tn + fb - drag - weight_comp - friction) / m
        if a > res.peak_accel:
            res.peak_accel = a
        if record:
            res.samples.append((t, s, v, tn, fb, a, m))
        # semi-implicit Euler at a very fine step; the rail phase is < 1 s
        v_new = v + a * dt
        if v_new < 0.0:
            v_new = 0.0
        s_new = s + 0.5 * (v + v_new) * dt
        mf = max(0.0, mf - eng.fuel_flow(tn, thr) * dt)
        thr += (thr_cmd - thr) / eng.tau(thr_cmd, thr) * dt
        if thr > 1.0:
            thr = 1.0
        if s_new >= L:
            # land exactly on the rail end
            span = s_new - s
            frac = (L - s) / span if span > 1e-12 else 1.0
            v = v + (v_new - v) * frac
            t = t + dt * frac
            s = L
            break
        v, s, t = v_new, s_new, t + dt

    res.v_exit = v
    res.t_exit = t
    res.s = s
    res.h_exit = h0 + s * sin_t
    res.fuel_burned = fuel_kg - mf
    res.burnout_t = b_burn if b_thrust > 0 else None
    return res


def feasibility(spec: MissionSpec, fuel_kg: float) -> LaunchFeasibility:
    af, ls = spec.airframe, spec.launch
    h0 = spec.atmosphere.ground_altitude_m
    atmo = isa(h0, spec.atmosphere.delta_isa_k)
    b = ls.booster
    gross = af.mass_dry_kg + fuel_kg + (b.mass_kg if b.enabled else 0.0)
    rail = run_rail(spec, fuel_kg)
    v_stall = stall_speed(af, atmo.rho, af.mass_dry_kg + fuel_kg)
    v_req = ls.exit_margin * v_stall
    ok = rail.v_exit >= v_req
    b_thrust = b.thrust_n if b.enabled else 0.0
    burn = min(b.burn_time_s, rail.t_exit) if b.enabled else 0.0
    if ok:
        note = (f"Rail exit {rail.v_exit:.1f} m/s against a stall speed of {v_stall:.1f} m/s "
                f"({rail.v_exit / v_stall:.2f}x, requirement {ls.exit_margin:.2f}x).")
    else:
        note = (f"Rail exit {rail.v_exit:.1f} m/s is below the {v_req:.1f} m/s required "
                f"({ls.exit_margin:.2f} x V_stall {v_stall:.1f} m/s). "
                f"The aircraft leaves the rail unable to fly.")
    return LaunchFeasibility(
        v_exit_ms=rail.v_exit, v_stall_ms=v_stall, v_required_ms=v_req,
        margin_ratio=rail.v_exit / v_stall if v_stall > 0 else 0.0, feasible=ok,
        rail_time_s=rail.t_exit, gross_mass_kg=gross,
        booster_thrust_n=b_thrust, booster_impulse_ns=b_thrust * burn,
        booster_burn_time_s=burn,
        peak_rail_accel_g=rail.peak_accel / G0, note=note,
    )


def solve_booster(spec: MissionSpec, fuel_kg: float,
                  target_margin: Optional[float] = None,
                  max_thrust_n: float = 60000.0) -> LaunchFeasibility:
    """Size the RATO motor for the current rail length and exit margin.

    Solves for the thrust that just meets the exit requirement, with the burn
    time converged onto the actual rail transit time - the motor burns through
    the rail run and no longer. That is the minimum-thrust solution, and the one
    whose total impulse is close to invariant with rail length.

    Exit speed rises smoothly and monotonically with thrust, so this is a secant
    search seeded from the rigid-body estimate, not a bisection. A bisection to
    the same tolerance costs ten times as many rail integrations, and the
    mission panel calls this while a slider is moving.
    """
    af, ls = spec.airframe, spec.launch
    atmo = isa(spec.atmosphere.ground_altitude_m, spec.atmosphere.delta_isa_k)
    margin = ls.exit_margin if target_margin is None else target_margin
    v_stall = stall_speed(af, atmo.rho, af.mass_dry_kg + fuel_kg)
    v_target = margin * v_stall
    theta = math.radians(ls.rail_angle_deg)

    bare = run_rail(spec, fuel_kg, booster_thrust_override=0.0, booster_burn_override=0.0)
    if bare.v_exit >= v_target:
        return LaunchFeasibility(
            v_exit_ms=bare.v_exit, v_stall_ms=v_stall, v_required_ms=v_target,
            margin_ratio=bare.v_exit / v_stall, feasible=True, rail_time_s=bare.t_exit,
            gross_mass_kg=af.mass_dry_kg + fuel_kg, booster_thrust_n=0.0,
            booster_impulse_ns=0.0, booster_burn_time_s=0.0,
            peak_rail_accel_g=bare.peak_accel / G0,
            note="No booster required: engine thrust alone clears the exit requirement.")

    m = af.mass_dry_kg + fuel_kg + ls.booster.mass_kg
    # rigid-body seed: constant acceleration along the rail, engine thrust credited
    a_req = v_target * v_target / (2.0 * max(0.05, ls.rail_length_m))
    seed = m * (a_req + G0 * (math.sin(theta) + ls.rail_friction_mu * math.cos(theta)))
    seed = min(max(seed - spec.engine.thrust_static_sl_n, 10.0), max_thrust_n)
    burn = max(0.02, v_target / max(1.0, a_req))

    def exit_speed(thrust: float, burn_time: float, dt: float = 0.001) -> RailResult:
        return run_rail(spec, fuel_kg, dt=dt, booster_thrust_override=thrust,
                        booster_burn_override=burn_time)

    thrust = seed
    result = exit_speed(thrust, burn)
    for _ in range(14):
        # secant step on thrust at the current burn time
        x0, f0 = thrust, result.v_exit - v_target
        if abs(f0) < 1e-3 and abs(result.t_exit - burn) < 5e-4:
            break
        x1 = x0 * (1.15 if f0 < 0 else 0.87)
        x1 = min(max(x1, 1.0), max_thrust_n)
        r1 = exit_speed(x1, burn)
        f1 = r1.v_exit - v_target
        for _ in range(12):
            if abs(f1 - f0) < 1e-9:
                break
            x2 = x1 - f1 * (x1 - x0) / (f1 - f0)
            if not (0.0 < x2 < max_thrust_n) or x2 != x2:
                x2 = 0.5 * (x1 + (x0 if f0 * f1 < 0 else max_thrust_n * 0.05))
            x2 = min(max(x2, 1.0), max_thrust_n)
            r2 = exit_speed(x2, burn)
            f2 = r2.v_exit - v_target
            x0, f0, x1, f1, r1 = x1, f1, x2, f2, r2
            if abs(f2) < 1e-4:
                break
        thrust, result = x1, r1
        if abs(result.t_exit - burn) < 5e-4:
            break
        burn = result.t_exit

    burn = result.t_exit
    result = exit_speed(thrust, burn, dt=0.0002)
    impulse = thrust * burn
    return LaunchFeasibility(
        v_exit_ms=result.v_exit, v_stall_ms=v_stall, v_required_ms=v_target,
        margin_ratio=result.v_exit / v_stall if v_stall > 0 else 0.0,
        feasible=result.v_exit >= v_target - 0.05, rail_time_s=result.t_exit,
        gross_mass_kg=af.mass_dry_kg + fuel_kg + ls.booster.mass_kg,
        booster_thrust_n=thrust, booster_impulse_ns=impulse, booster_burn_time_s=burn,
        peak_rail_accel_g=result.peak_accel / G0,
        note=(f"{thrust / 1000.0:.2f} kN for {burn * 1000.0:.0f} ms "
              f"({impulse:.0f} N s) on a {ls.rail_length_m:.1f} m rail, "
              f"peak {result.peak_accel / G0:.0f} g."))


def rail_length_trade(spec: MissionSpec, fuel_kg: float,
                      lengths_m: Optional[List[float]] = None) -> List[dict]:
    """Booster thrust and impulse against rail length. Impulse stays near-constant;
    thrust falls roughly as 1/L. That trade is the point of the feature."""
    lengths = lengths_m or [1.5, 2.0, 2.5, 3.0, 4.0, 5.0, 6.0, 8.0, 10.0]
    out = []
    import copy
    for L in lengths:
        s2 = copy.deepcopy(spec)
        s2.launch.rail_length_m = L
        f = solve_booster(s2, fuel_kg)
        out.append({
            "rail_length_m": L,
            "booster_thrust_n": f.booster_thrust_n,
            "booster_burn_time_s": f.booster_burn_time_s,
            "booster_impulse_ns": f.booster_impulse_ns,
            "peak_g": f.peak_rail_accel_g,
            "v_exit_ms": f.v_exit_ms,
        })
    return out
