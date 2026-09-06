"""Range-to-fuel sizing, mission timeline, and command schedules.

Fuel is not a free parameter. The operator picks a mission distance; the climb
and descent legs are integrated against altitude, the cruise leg is sized by
Breguet range for a jet, and a reserve is added. The resulting fuel mass feeds
straight back into gross mass, wing loading, stall speed, the rail-exit
requirement and maximum Mach.

The same calculation produces the mission timeline, so the generated throttle
and altitude schedules and the fuel budget always describe the same flight.
"""
from __future__ import annotations

import math
from typing import List, Optional, Sequence, Tuple

from .aero import cd0_of_mach
from .atmosphere import AtmoState, isa
from .constants import G0, RHO0_ISA
from .engine import EngineProfile
from .schema import (AirframeSpec, FuelBudget, MissionSpec, ProfilePlan,
                     ResolvedProfile, ScheduleNode)


# --------------------------------------------------------------------------
# Schedule evaluation
# --------------------------------------------------------------------------

def eval_schedule(nodes: Sequence[ScheduleNode], t: float) -> float:
    """Piecewise-linear, held flat outside the node range."""
    if not nodes:
        return 0.0
    if t <= nodes[0].t:
        return nodes[0].value
    for i in range(1, len(nodes)):
        a, b = nodes[i - 1], nodes[i]
        if t <= b.t:
            dt = b.t - a.t
            if dt <= 1e-12:
                return b.value
            return a.value + (t - a.t) / dt * (b.value - a.value)
    return nodes[-1].value


def fill_grids(nodes: Sequence[ScheduleNode], n: int, step: float,
               lo: Optional[float] = None, hi: Optional[float] = None
               ) -> Tuple[List[float], List[float]]:
    """Rasterise a piecewise-linear schedule and its slope onto a uniform time grid.

    Filling segment by segment is O(n) arithmetic. Calling eval_schedule() at each
    of ~120 000 grid points instead costs a linear search per point and dominated
    the solve before this was written.
    """
    val = [0.0] * n
    slope = [0.0] * n
    if not nodes:
        return val, slope
    first = nodes[0]
    k = 0
    end = min(n, int(first.t / step) + 1)
    while k < end:
        val[k] = first.value
        k += 1
    for a, b in zip(nodes, nodes[1:]):
        span = b.t - a.t
        sl = 0.0 if span <= 1e-12 else (b.value - a.value) / span
        end = min(n, int(b.t / step) + 1)
        while k < end:
            v = a.value + (k * step - a.t) * sl
            if lo is not None and v < lo:
                v = lo
            elif hi is not None and v > hi:
                v = hi
            val[k] = v
            slope[k] = sl
            k += 1
        if k >= n:
            break
    last = nodes[-1].value
    if lo is not None and last < lo:
        last = lo
    elif hi is not None and last > hi:
        last = hi
    while k < n:
        val[k] = last
        k += 1
    return val, slope


def schedule_slope(nodes: Sequence[ScheduleNode], t: float) -> float:
    if len(nodes) < 2 or t <= nodes[0].t or t >= nodes[-1].t:
        return 0.0
    for i in range(1, len(nodes)):
        a, b = nodes[i - 1], nodes[i]
        if t <= b.t:
            dt = b.t - a.t
            return 0.0 if dt <= 1e-12 else (b.value - a.value) / dt
    return 0.0


# --------------------------------------------------------------------------
# Engine inversion
# --------------------------------------------------------------------------

def throttle_for_thrust(eng: EngineProfile, rho: float, mach: float, v: float,
                        thrust_req_n: float) -> float:
    """Throttle that produces `thrust_req_n`. Values above 1.0 are returned
    unclamped - that is the signal that the thrust is unavailable."""
    denom = eng.mdot_0 * (rho / RHO0_ISA) * eng.ram_recovery(mach) * (eng.ve - v)
    if denom <= 1e-9:
        return float("inf")
    frac = (thrust_req_n / denom - eng.idle_frac) / (1.0 - eng.idle_frac)
    return 0.0 if frac <= 0.0 else frac ** (1.0 / eng.spool_exp)


# --------------------------------------------------------------------------
# Steady-state points
# --------------------------------------------------------------------------

def _drag(af: AirframeSpec, rho: float, v: float, mach: float, lift_n: float) -> Tuple[float, float, float]:
    qs = 0.5 * rho * v * v * af.wing_area_m2
    if qs <= 1e-9:
        return 0.0, 0.0, 0.0
    cl = lift_n / qs
    cd = cd0_of_mach(af, mach) + af.k_induced * cl * cl
    return cd * qs, cl, cd


def steady_climb_speed(af: AirframeSpec, eng: EngineProfile, atmo: AtmoState,
                       mass: float, roc: float, throttle: float) -> Tuple[float, bool]:
    """Airspeed at which a steady climb at `roc` closes.

    Excess thrust must supply the climb power:  T(V) - D(V) - W*roc/V = 0.
    There are generally two roots; the aircraft settles on the upper one under a
    fixed throttle. Returns (V, limited) where `limited` means no root exists -
    the commanded climb rate is beyond the aircraft's specific excess power.
    """
    w = mass * G0

    def f(v: float) -> float:
        if v <= 1.0:
            return -1e9
        m = v / atmo.a_ms
        sin_g = roc / v
        if sin_g > 0.999:
            return -1e9
        cos_g = math.sqrt(max(0.0, 1.0 - sin_g * sin_g))
        d, _, _ = _drag(af, atmo.rho, v, m, w * cos_g)
        return eng.net_thrust(atmo.rho, m, v, throttle) - d - w * sin_g

    lo, hi = 8.0, 0.72 * eng.ve      # above this, ram drag alone exceeds jet momentum
    n = 64
    step = (hi - lo) / n
    prev_v, prev_f = lo, f(lo)
    upper = None
    peak_v, peak_f = lo, prev_f
    for i in range(1, n + 1):
        v = lo + i * step
        fv = f(v)
        if fv > peak_f:
            peak_f, peak_v = fv, v
        if prev_f > 0.0 >= fv:
            upper = (prev_v, v)
        prev_v, prev_f = v, fv
    if upper is None:
        return peak_v, True
    a, bnd = upper
    for _ in range(34):
        mid = 0.5 * (a + bnd)
        if f(mid) > 0.0:
            a = mid
        else:
            bnd = mid
    return 0.5 * (a + bnd), False


def cruise_point(af: AirframeSpec, eng: EngineProfile, alt: float, mach: float,
                 mass: float, delta_isa: float) -> Tuple[float, float, float, float]:
    """(V, L/D, drag_n, throttle) for steady level cruise."""
    atmo = isa(alt, delta_isa)
    v = mach * atmo.a_ms
    d, cl, cd = _drag(af, atmo.rho, v, mach, mass * G0)
    ld = cl / cd if cd > 0 else 0.0
    return v, ld, d, throttle_for_thrust(eng, atmo.rho, mach, v, d)


# --------------------------------------------------------------------------
# Leg integration
# --------------------------------------------------------------------------

def _climb_leg(af, eng, h0, h1, roc, mass, delta_isa, wind, n=16):
    """Integrate a full-throttle climb over altitude. Returns (t, ground_dist, fuel, v_end, limited)."""
    if h1 <= h0 or roc <= 0.0:
        return 0.0, 0.0, 0.0, 0.0, False
    dh = (h1 - h0) / n
    dt = dh / roc
    t = dist = fuel = 0.0
    m = mass
    v = 0.0
    limited = False
    for i in range(n):
        atmo = isa(h0 + (i + 0.5) * dh, delta_isa)
        v, lim = steady_climb_speed(af, eng, atmo, m, roc, 1.0)
        limited = limited or lim
        thrust = eng.net_thrust(atmo.rho, v / atmo.a_ms, v, 1.0)
        wf = eng.fuel_flow(thrust, 1.0)
        vh = math.sqrt(max(0.0, v * v - roc * roc))
        t += dt
        dist += dt * max(0.0, vh - wind)
        fuel += wf * dt
        m -= wf * dt
    return t, dist, fuel, v, limited


def _descent_leg(af, eng, h1, h0, rod, mach_start, mass, delta_isa, wind, throttle, n=200):
    """Powered descent at a fixed throttle, integrated forward in time.

    Airspeed is free: pulling the throttle back at top of descent leaves thrust
    well below drag, so the aircraft decelerates as it comes down. Holding a
    constant Mach on the way down would need most of cruise thrust and would not
    be a descent the operator recognises.

    Returns (t, ground_dist, fuel, v_mean, throttle).
    """
    if h1 <= h0 or rod <= 0.0:
        return 0.0, 0.0, 0.0, 0.0, throttle
    total_t = (h1 - h0) / rod
    dt = total_t / n
    h = h1
    atmo = isa(h, delta_isa)
    v = mach_start * atmo.a_ms
    m = mass
    dist = fuel = vsum = 0.0
    for _ in range(n):
        atmo = isa(h, delta_isa)
        mach = v / atmo.a_ms
        sin_g = -rod / v if v > rod else -0.999
        cos_g = math.sqrt(max(0.0, 1.0 - sin_g * sin_g))
        d, _, _ = _drag(af, atmo.rho, v, mach, m * G0 * cos_g)
        thrust = eng.net_thrust(atmo.rho, mach, v, throttle)
        wf = eng.fuel_flow(thrust, throttle)
        v += ((thrust - d) / m - G0 * sin_g) * dt
        if v < 5.0:
            v = 5.0
        vh = math.sqrt(max(0.0, v * v - rod * rod))
        dist += dt * max(0.0, vh - wind)
        fuel += wf * dt
        m -= wf * dt
        h -= rod * dt
        vsum += v
    return total_t, dist, fuel, vsum / n, throttle


# --------------------------------------------------------------------------
# Sizing
# --------------------------------------------------------------------------

def size_mission(spec: MissionSpec, h_exit: float) -> Tuple[FuelBudget, ProfilePlan]:
    af, eng, mp = spec.airframe, spec.engine, spec.mission
    d_isa = spec.atmosphere.delta_isa_k
    wind = spec.atmosphere.headwind_ms
    range_m = mp.mission_distance_km * 1000.0
    dry = af.mass_dry_kg
    cap = af.fuel_capacity_kg
    roc = max(1.0, mp.climb_rate_ms)
    rod = max(1.0, mp.descent_rate_ms)
    h_cr = mp.cruise_altitude_m
    h_end = min(mp.end_altitude_m, h_cr)

    fuel_total = min(cap, 0.5 * cap)
    t_cl = d_cl = f_cl = v_cl = 0.0
    t_de = d_de = f_de = v_de = thr_de = 0.0
    f_cr = f_res = t_cr = d_cr = 0.0
    v_cr = ld_cr = thr_cr = 0.0
    climb_limited = False
    note_bits: List[str] = []

    for _ in range(8):
        m0 = dry + fuel_total
        t_cl, d_cl, f_cl, v_cl, climb_limited = _climb_leg(af, eng, h_exit, h_cr, roc, m0, d_isa, wind)
        m_toc = m0 - f_cl

        # descent mass is only known after cruise; iterate on it inside the outer loop
        m_desc_start = max(dry, m_toc - f_cr)
        t_de, d_de, f_de, v_de, thr_de = _descent_leg(
            af, eng, h_cr, h_end, rod, mp.target_mach, m_desc_start, d_isa, wind,
            min(1.0, max(0.0, mp.descent_throttle)))

        d_cr = range_m - d_cl - d_de
        if d_cr < 0.0:
            d_cr = 0.0
        v_cr, ld_cr, drag_cr, thr_cr = cruise_point(af, eng, h_cr, mp.target_mach, m_toc, d_isa)
        v_gnd = v_cr - wind
        if v_gnd < 1.0:
            v_gnd = 1.0
        if v_cr <= 0.0 or ld_cr <= 0.0:
            f_cr, t_cr = cap, 0.0
        else:
            c = eng.tsfc_si(min(1.0, max(0.0, thr_cr)))
            air_dist = d_cr * v_cr / v_gnd
            f_cr = m_toc * (1.0 - math.exp(-air_dist * G0 * c / (v_cr * ld_cr)))
            t_cr = air_dist / v_cr
        f_res = mp.reserve_frac * (f_cr + f_de)
        new_total = f_cl + f_cr + f_de + f_res
        if abs(new_total - fuel_total) < 5e-4:
            fuel_total = new_total
            break
        fuel_total = 0.4 * fuel_total + 0.6 * new_total

    feasible = fuel_total <= cap + 1e-9
    loaded = min(fuel_total, cap) if mp.auto_fuel else min(mp.fuel_mass_kg, cap)
    max_range_m = _max_range(spec, cap, h_exit)

    if not feasible:
        note_bits.append(
            f"{mp.mission_distance_km:.0f} km needs {fuel_total:.2f} kg of fuel; the tank holds "
            f"{cap:.2f} kg. Maximum range on a full tank is {max_range_m / 1000.0:.1f} km.")
    if d_cr <= 0.0 and range_m > 0:
        note_bits.append(
            f"Climb and descent alone cover {(d_cl + d_de) / 1000.0:.1f} km, more than the "
            f"{mp.mission_distance_km:.0f} km requested. There is no cruise leg.")
    if climb_limited:
        note_bits.append(f"Commanded climb rate {roc:.0f} m/s exceeds available specific excess "
                         f"power somewhere in the climb.")
    if not mp.auto_fuel:
        note_bits.append("Fuel mass set manually; sizing shown for reference only.")

    budget = FuelBudget(
        requested_range_km=mp.mission_distance_km, fuel_climb_kg=f_cl,
        fuel_cruise_kg=f_cr, fuel_descent_kg=f_de, fuel_reserve_kg=f_res,
        fuel_required_kg=fuel_total, fuel_loaded_kg=loaded, fuel_capacity_kg=cap,
        feasible=feasible, max_range_at_capacity_km=max_range_m / 1000.0,
        cruise_ld=ld_cr, cruise_tas_ms=v_cr, cruise_throttle=thr_cr,
        climb_distance_km=d_cl / 1000.0, cruise_distance_km=d_cr / 1000.0,
        descent_distance_km=d_de / 1000.0, note=" ".join(note_bits))

    if mp.auto_profile:
        t_toc = t_cl
        t_desc_start = t_cl + t_cr
        duration = t_cl + t_cr + t_de
    else:
        t_toc = max(1.0, (h_cr - h_exit) / roc)
        t_desc_start = mp.descent_start_s
        duration = mp.duration_s
    duration = max(duration, t_desc_start + 1.0, t_toc + 2.0)

    plan = ProfilePlan(
        h_exit_m=h_exit, t_climb_s=t_cl, t_cruise_s=t_cr, t_descent_s=t_de,
        t_toc_s=t_toc, t_descent_start_s=t_desc_start, duration_s=duration,
        climb_tas_ms=v_cl, cruise_tas_ms=v_cr, descent_tas_ms=v_de,
        climb_throttle=1.0, cruise_throttle=min(1.0, max(0.0, thr_cr)),
        descent_throttle=thr_de, climb_limited=climb_limited,
        note=(f"Climb {t_cl:.0f} s / {d_cl / 1000.0:.1f} km, cruise {t_cr:.0f} s / "
              f"{d_cr / 1000.0:.1f} km, descent {t_de:.0f} s / {d_de / 1000.0:.1f} km."))
    return budget, plan


def _max_range(spec: MissionSpec, fuel_kg: float, h_exit: float) -> float:
    af, eng, mp = spec.airframe, spec.engine, spec.mission
    d_isa, wind = spec.atmosphere.delta_isa_k, spec.atmosphere.headwind_ms
    dry, roc = af.mass_dry_kg, max(1.0, mp.climb_rate_ms)
    rod = max(1.0, mp.descent_rate_ms)
    h_cr, h_end = mp.cruise_altitude_m, min(mp.end_altitude_m, mp.cruise_altitude_m)
    m0 = dry + fuel_kg
    t_cl, d_cl, f_cl, _, _ = _climb_leg(af, eng, h_exit, h_cr, roc, m0, d_isa, wind)
    m_toc = m0 - f_cl
    t_de, d_de, f_de, _, _ = _descent_leg(af, eng, h_cr, h_end, rod, mp.target_mach,
                                          dry + 0.1, d_isa, wind,
                                          min(1.0, max(0.0, mp.descent_throttle)))
    usable = max(0.0, fuel_kg - f_cl - f_de) / (1.0 + mp.reserve_frac)
    m1, m2 = m_toc, m_toc - usable
    if m2 <= dry * 0.5 or usable <= 0.0:
        return d_cl + d_de
    v_cr, ld_cr, _, thr = cruise_point(af, eng, h_cr, mp.target_mach, 0.5 * (m1 + m2), d_isa)
    if v_cr <= 0.0 or ld_cr <= 0.0:
        return d_cl + d_de
    c = eng.tsfc_si(min(1.0, max(0.0, thr)))
    air = (v_cr * ld_cr / (G0 * c)) * math.log(m1 / m2)
    v_gnd = max(1.0, v_cr - wind)
    return d_cl + d_de + air * v_gnd / v_cr


# --------------------------------------------------------------------------
# Schedule generation
# --------------------------------------------------------------------------

def default_altitude_schedule(spec: MissionSpec, plan: ProfilePlan) -> List[ScheduleNode]:
    mp = spec.mission
    return [
        ScheduleNode(0.0, plan.h_exit_m),
        ScheduleNode(round(plan.t_toc_s, 3), mp.cruise_altitude_m),
        ScheduleNode(round(plan.t_descent_start_s, 3), mp.cruise_altitude_m),
        ScheduleNode(round(plan.duration_s, 3), min(mp.end_altitude_m, mp.cruise_altitude_m)),
    ]


def default_throttle_schedule(spec: MissionSpec, plan: ProfilePlan) -> List[ScheduleNode]:
    blend = 6.0
    t1 = plan.t_toc_s
    t2 = min(plan.t_descent_start_s - 1.0, t1 + blend)
    t3 = plan.t_descent_start_s
    t4 = min(plan.duration_s, t3 + blend)
    return [
        ScheduleNode(0.0, round(plan.climb_throttle, 4)),
        ScheduleNode(round(t1, 3), round(plan.climb_throttle, 4)),
        ScheduleNode(round(max(t2, t1 + 0.5), 3), round(plan.cruise_throttle, 4)),
        ScheduleNode(round(t3, 3), round(plan.cruise_throttle, 4)),
        ScheduleNode(round(max(t4, t3 + 0.5), 3), round(plan.descent_throttle, 4)),
        ScheduleNode(round(plan.duration_s, 3), round(plan.descent_throttle, 4)),
    ]


def resolve_profile(spec: MissionSpec, plan: ProfilePlan) -> ResolvedProfile:
    thr = spec.control.throttle_schedule or default_throttle_schedule(spec, plan)
    alt = spec.control.altitude_schedule or default_altitude_schedule(spec, plan)
    return ResolvedProfile(plan=plan, throttle_schedule=thr, altitude_schedule=alt)


def mach_from_tas(v: float, a_ms: float) -> float:
    return v / a_ms if a_ms > 0 else 0.0
