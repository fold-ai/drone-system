"""Steady level-flight performance: thrust available vs drag required.

The crossing of the two curves is the maximum level speed. This module also
produces the Mach 1 deficit readout - thrust required versus thrust available at
M = 1.0 - which is the honest answer to "can it go supersonic".
"""
from __future__ import annotations

import math
from typing import List, Optional, Tuple

from .aero import cd0_of_mach
from .atmosphere import isa
from .constants import G0
from .engine import EngineProfile
from .schema import (AirframeSpec, AtmosphereSpec, Mach1Deficit, MachSweepPoint)


def level_flight_point(af: AirframeSpec, eng: EngineProfile, rho: float, a_ms: float,
                       mass_kg: float, mach: float, throttle: float = 1.0) -> Tuple[float, float, float, float]:
    """Return (thrust_available_n, drag_required_n, cl, cd) for steady level flight."""
    v = mach * a_ms
    q = 0.5 * rho * v * v
    qs = q * af.wing_area_m2
    w = mass_kg * G0
    cl = w / qs if qs > 1e-9 else 0.0
    cd = cd0_of_mach(af, mach) + af.k_induced * cl * cl
    drag = cd * qs
    thrust = eng.net_thrust(rho, mach, v, throttle)
    return thrust, drag, cl, cd


def mach_sweep(af: AirframeSpec, eng: EngineProfile, altitude_m: float, mass_kg: float,
               delta_isa: float = 0.0, throttle: float = 1.0,
               m_lo: float = 0.05, m_hi: float = 1.10, n: int = 106) -> List[MachSweepPoint]:
    atmo = isa(altitude_m, delta_isa)
    pts: List[MachSweepPoint] = []
    step = (m_hi - m_lo) / (n - 1)
    for i in range(n):
        m = m_lo + i * step
        t, d, cl, cd = level_flight_point(af, eng, atmo.rho, atmo.a_ms, mass_kg, m, throttle)
        pts.append(MachSweepPoint(m, t, d, cl, cd, t - d))
    return pts


def max_level_mach(af: AirframeSpec, eng: EngineProfile, altitude_m: float, mass_kg: float,
                   delta_isa: float = 0.0, throttle: float = 1.0) -> float:
    """Highest Mach at which thrust available still meets drag required, by bisection
    on the upper crossing of the excess-thrust curve."""
    atmo = isa(altitude_m, delta_isa)

    def excess(m: float) -> float:
        t, d, _, _ = level_flight_point(af, eng, atmo.rho, atmo.a_ms, mass_kg, m, throttle)
        return t - d

    lo, hi = 0.05, 1.60
    n = 160
    step = (hi - lo) / n
    prev_m, prev_e = lo, excess(lo)
    crossing: Optional[Tuple[float, float]] = None
    for i in range(1, n + 1):
        m = lo + i * step
        e = excess(m)
        if prev_e > 0.0 >= e:
            crossing = (prev_m, m)
        prev_m, prev_e = m, e
    if crossing is None:
        # never positive -> cannot sustain level flight anywhere; or never negative
        return 0.0 if prev_e < 0 else hi
    a, b = crossing
    for _ in range(60):
        mid = 0.5 * (a + b)
        if excess(mid) > 0.0:
            a = mid
        else:
            b = mid
    return 0.5 * (a + b)


def mach1_deficit(af: AirframeSpec, eng: EngineProfile, altitude_m: float, mass_kg: float,
                  delta_isa: float = 0.0) -> Mach1Deficit:
    atmo = isa(altitude_m, delta_isa)
    t1, d1, _, cd1 = level_flight_point(af, eng, atmo.rho, atmo.a_ms, mass_kg, 1.0, 1.0)
    mmax = max_level_mach(af, eng, altitude_m, mass_kg, delta_isa, 1.0)
    ratio = (d1 / t1) if t1 > 1e-9 else float("inf")
    if t1 <= 0.0:
        note = ("Net thrust at M = 1.0 is zero or negative: ram drag of the captured "
                "stream exceeds jet momentum at this flight speed.")
    else:
        note = (f"Level flight at M 1.0 needs {d1:.0f} N; the engine delivers {t1:.0f} N "
                f"at that speed. Shortfall {d1 - t1:.0f} N ({ratio:.1f}x).")
    return Mach1Deficit(
        altitude_m=altitude_m, mass_kg=mass_kg, tas_at_mach1_ms=atmo.a_ms,
        thrust_required_n=d1, thrust_available_n=t1, deficit_n=d1 - t1,
        deficit_ratio=ratio, max_level_mach=mmax, max_level_tas_ms=mmax * atmo.a_ms,
        cd_at_mach1=cd1, note=note,
    )


def best_ld_at(af: AirframeSpec, mach: float) -> float:
    return 0.5 / math.sqrt(af.k_induced * cd0_of_mach(af, mach))
