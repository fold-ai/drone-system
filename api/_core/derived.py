"""Values derived from the spec that the interface needs but must not recompute.

Aspect ratio, induced-drag factor, best L/D and stall speed all follow from the
airframe by one line of algebra each. That line belongs in exactly one place, and
this is the module that ships it to the client.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

from .aero import cd0_of_mach, stall_speed
from .atmosphere import isa
from .constants import G0
from .schema import MissionSpec


@dataclass
class Derived:
    aspect_ratio: float
    k_induced: float
    ld_max: float
    cl_best_ld: float
    v_best_ld_ms: float
    mass_dry_kg: float
    gross_mass_kg: float
    wing_loading_nm2: float
    thrust_to_weight: float
    v_stall_sl_ms: float
    v_stall_cruise_ms: float
    rail_exit_required_ms: float
    static_margin_full: float
    static_margin_empty: float
    x_cg_full_m: float
    x_cg_empty_m: float
    cruise_rho: float
    cruise_a_ms: float
    cruise_tas_at_target_ms: float


def derive(spec: MissionSpec, fuel_kg: float) -> Derived:
    af, eng = spec.airframe, spec.engine
    gross = af.mass_dry_kg + fuel_kg + (spec.launch.booster.mass_kg
                                        if spec.launch.booster.enabled else 0.0)
    sl = isa(spec.atmosphere.ground_altitude_m, spec.atmosphere.delta_isa_k)
    cr = isa(spec.mission.cruise_altitude_m, spec.atmosphere.delta_isa_k)
    flying = af.mass_dry_kg + fuel_kg
    v_stall_sl = stall_speed(af, sl.rho, flying) if af.cl_max > 0 else 0.0
    cl_opt = af.cl_best_ld()
    denom = cr.rho * af.wing_area_m2 * cl_opt
    v_best = math.sqrt(2.0 * flying * G0 / denom) if denom > 1e-12 else 0.0
    xb = spec.launch.booster.x_booster_m
    return Derived(
        aspect_ratio=af.aspect_ratio, k_induced=af.k_induced, ld_max=af.ld_max(),
        cl_best_ld=cl_opt, v_best_ld_ms=v_best, mass_dry_kg=af.mass_dry_kg,
        gross_mass_kg=gross, wing_loading_nm2=flying * G0 / af.wing_area_m2,
        thrust_to_weight=eng.thrust_static_sl_n / (gross * G0) if gross > 0 else 0.0,
        v_stall_sl_ms=v_stall_sl,
        v_stall_cruise_ms=stall_speed(af, cr.rho, flying) if af.cl_max > 0 else 0.0,
        rail_exit_required_ms=spec.launch.exit_margin * v_stall_sl,
        static_margin_full=af.static_margin(fuel_kg), static_margin_empty=af.static_margin(0.0),
        x_cg_full_m=af.cg(fuel_kg, 0.0, xb), x_cg_empty_m=af.cg(0.0, 0.0, xb),
        cruise_rho=cr.rho, cruise_a_ms=cr.a_ms,
        cruise_tas_at_target_ms=spec.mission.target_mach * cr.a_ms,
    )
