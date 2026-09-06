"""Drag polar with a blended transonic rise.

    CL = 2 L / (rho V^2 S)
    CD = CD0(M) + k CL^2,        k = 1 / (pi AR e)
    CD0(M) = CD0_sub + dCD_wave * 0.5 * (1 + tanh((M - M_dd) / w))

The tanh blend is deliberate: a step at M_dd makes the integrator ring and hides
the fact that drag rise begins below the divergence Mach number.
"""
from __future__ import annotations

import math
from typing import NamedTuple

from .schema import AirframeSpec


class AeroPoint(NamedTuple):
    cl: float
    cd: float
    cd0: float
    cdi: float
    cd_wave: float
    lift_n: float
    drag_n: float
    ld: float
    q_pa: float
    stall_limited: bool


def cd0_of_mach(af: AirframeSpec, mach: float) -> float:
    return af.cd0_sub + af.dcd_wave * 0.5 * (1.0 + math.tanh((mach - af.mach_dd) / af.wave_width))


def wave_component(af: AirframeSpec, mach: float) -> float:
    return af.dcd_wave * 0.5 * (1.0 + math.tanh((mach - af.mach_dd) / af.wave_width))


def evaluate(af: AirframeSpec, rho: float, v: float, mach: float, lift_required_n: float) -> AeroPoint:
    """Aero state for a demanded lift. Lift is clipped at CL_max and the clip is reported."""
    q = 0.5 * rho * v * v
    qs = q * af.wing_area_m2
    if qs <= 1e-9:
        return AeroPoint(0.0, af.cd0_sub, af.cd0_sub, 0.0, 0.0, 0.0, 0.0, 0.0, q, False)
    cl_req = lift_required_n / qs
    stall = abs(cl_req) > af.cl_max
    cl = af.cl_max if cl_req > af.cl_max else (-af.cl_max if cl_req < -af.cl_max else cl_req)
    wave = wave_component(af, mach)
    cd0 = af.cd0_sub + wave
    cdi = af.k_induced * cl * cl
    cd = cd0 + cdi
    lift = cl * qs
    drag = cd * qs
    return AeroPoint(cl, cd, cd0, cdi, wave, lift, drag, (cl / cd if cd > 0 else 0.0), q, stall)


def stall_speed(af: AirframeSpec, rho: float, mass_kg: float, g: float = 9.80665,
                load_factor: float = 1.0) -> float:
    w = mass_kg * g * load_factor
    return math.sqrt(2.0 * w / (rho * af.wing_area_m2 * af.cl_max))


def reynolds(rho: float, v: float, mu: float, ref_len: float) -> float:
    if mu <= 0:
        return 0.0
    return rho * v * ref_len / mu
