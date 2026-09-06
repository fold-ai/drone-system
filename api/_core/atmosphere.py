"""International Standard Atmosphere, troposphere + lower stratosphere.

Supports a non-standard-day temperature offset (delta_isa). The offset shifts
temperature and therefore density and speed of sound; pressure is left on the
standard profile, which is the usual engineering convention for a hot/cold day.
"""
from __future__ import annotations

import math
from typing import NamedTuple

from .constants import (GAMMA_AIR, H_TROPO, ISA_EXP, LAPSE, P0_ISA, P_TROPO,
                        R_AIR, SUTH_C1, SUTH_S, T0_ISA, T_TROPO)


class AtmoState(NamedTuple):
    temp_k: float
    press_pa: float
    rho: float
    a_ms: float
    mu: float


_RGAS_T = R_AIR * T_TROPO
_G0 = 9.80665


def isa(h: float, delta_isa: float = 0.0) -> AtmoState:
    """Return atmospheric state at geopotential altitude h (m)."""
    if h < H_TROPO:
        t_std = T0_ISA - LAPSE * h
        p = P0_ISA * (t_std / T0_ISA) ** ISA_EXP
    else:
        t_std = T_TROPO
        p = P_TROPO * math.exp(-_G0 * (h - H_TROPO) / _RGAS_T)
    t = t_std + delta_isa
    rho = p / (R_AIR * t)
    a = math.sqrt(GAMMA_AIR * R_AIR * t)
    mu = SUTH_C1 * t ** 1.5 / (t + SUTH_S)
    return AtmoState(t, p, rho, a, mu)


def density(h: float, delta_isa: float = 0.0) -> float:
    return isa(h, delta_isa).rho


def speed_of_sound(h: float, delta_isa: float = 0.0) -> float:
    return isa(h, delta_isa).a


def pressure_altitude(p: float) -> float:
    """Invert the standard pressure profile. Useful for mapping bench data."""
    if p >= P_TROPO:
        return (T0_ISA / LAPSE) * (1.0 - (p / P0_ISA) ** (1.0 / ISA_EXP))
    return H_TROPO - _RGAS_T / _G0 * math.log(p / P_TROPO)
