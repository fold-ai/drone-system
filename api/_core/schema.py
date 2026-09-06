"""Typed mission specification and trajectory result.

This module is the ONLY definition of the wire format. `scripts/gen_types.py`
reads these dataclasses and emits `lib/types.ts`. Never hand-edit that file.
"""
from __future__ import annotations

import json
import math
from dataclasses import dataclass, field, fields, is_dataclass
from typing import Any, Dict, List, Optional, get_args, get_origin, get_type_hints

from .constants import G0


# --------------------------------------------------------------------------
# Schedules
# --------------------------------------------------------------------------

@dataclass
class ScheduleNode:
    """One breakpoint of a piecewise-linear command schedule."""
    t: float          # s, mission time
    value: float      # units depend on the schedule


# --------------------------------------------------------------------------
# Airframe
# --------------------------------------------------------------------------

@dataclass
class PlanformSpec:
    """Cranked-delta blended wing body, from the ACT-1 plan-view CAD.

    These describe the shape that gets drawn and the shape the planform area is
    measured from. They are geometry only: the drag polar is referenced to
    AirframeSpec.wing_area_m2, and planform.reconcile() reports when the two
    disagree rather than quietly reconciling them.
    """
    sweep_inboard_deg: float = 67.0   # inboard leading-edge sweep
    sweep_outer_deg: float = 40.0     # outer panel sweep, aft of the crank
    crank_frac: float = 0.58          # crank station as a fraction of semispan
    radome_frac: float = 0.30         # ogive radome length as a fraction of overall
    body_halfwidth_frac: float = 0.24 # centre body half-width, fraction of semispan
    te_notch_halfwidth_frac: float = 0.10  # exhaust notch half-width, fraction of semispan
    te_notch_depth_frac: float = 0.09      # notch depth, fraction of overall length
    tip_chord_frac: float = 1.00      # 1.0 = squared tip running back to the TE
    thickness_root_frac: float = 0.135     # t/c at the centreline
    thickness_tip_frac: float = 0.070      # t/c at the tip
    twist_root_deg: float = 0.0
    twist_tip_deg: float = -2.0       # washout; geometry only, not fed to the polar
    inlet_start_frac: float = 0.42    # dorsal inlet lip, fraction of length
    inlet_length_frac: float = 0.16
    engine_radius_frac: float = 0.055 # engine casing radius as a fraction of length
    fin_span_frac: float = 0.10       # blade surface height, fraction of semispan
    fin_station_frac: float = 0.62    # blade station, fraction of semispan


@dataclass
class AirframeSpec:
    """Carbon-composite blended-delta UAV. All lengths measured aft from the nose datum."""
    # planform
    wing_area_m2: float = 0.30       # S
    span_m: float = 1.10             # b  -> AR = b^2/S = 4.033
    mac_m: float = 0.2727            # mean aerodynamic chord, S/b for the reference planform
    length_m: float = 2.00           # overall length, used by the 3D placeholder

    # drag polar
    cd0_sub: float = 0.024           # subsonic zero-lift drag coefficient
    mach_dd: float = 0.82            # drag-divergence Mach number
    dcd_wave: float = 0.045          # wave drag increment fully developed above M_dd
    wave_width: float = 0.06         # tanh blend width of the drag rise
    oswald_e: float = 0.72           # Oswald span efficiency
    cl_max: float = 0.90             # usable maximum lift coefficient

    # mass budget (kg)
    mass_airframe_kg: float = 6.5    # carbon skins + ribs
    mass_engine_kg: float = 2.8      # turbojet + mounts
    mass_avionics_kg: float = 1.8    # avionics, servos, battery
    mass_payload_kg: float = 1.0     # 0 - 3.0
    fuel_capacity_kg: float = 3.0    # tank volume limit

    # balance (m aft of nose datum)
    x_airframe_m: float = 0.95
    x_engine_m: float = 1.45
    x_avionics_m: float = 0.45
    x_payload_m: float = 0.55
    x_fuel_m: float = 0.80
    x_np_m: float = 0.96             # neutral point
    static_margin_min: float = 0.03  # flag below 3% MAC

    planform: PlanformSpec = field(default_factory=PlanformSpec)
    planform_area_tolerance: float = 0.02   # warn above 2% disagreement

    @property
    def aspect_ratio(self) -> float:
        return self.span_m * self.span_m / self.wing_area_m2

    @property
    def k_induced(self) -> float:
        return 1.0 / (math.pi * self.aspect_ratio * self.oswald_e)

    @property
    def mass_dry_kg(self) -> float:
        """Everything except fuel and any attached booster."""
        return (self.mass_airframe_kg + self.mass_engine_kg
                + self.mass_avionics_kg + self.mass_payload_kg)

    @property
    def dry_moment(self) -> float:
        return (self.mass_airframe_kg * self.x_airframe_m
                + self.mass_engine_kg * self.x_engine_m
                + self.mass_avionics_kg * self.x_avionics_m
                + self.mass_payload_kg * self.x_payload_m)

    def cg(self, fuel_kg: float, booster_kg: float = 0.0, x_booster_m: float = 1.10) -> float:
        m = self.mass_dry_kg + fuel_kg + booster_kg
        mom = self.dry_moment + fuel_kg * self.x_fuel_m + booster_kg * x_booster_m
        return mom / m

    def static_margin(self, fuel_kg: float, booster_kg: float = 0.0) -> float:
        return (self.x_np_m - self.cg(fuel_kg, booster_kg)) / self.mac_m

    def ld_max(self, cd0: Optional[float] = None) -> float:
        """Analytic best lift-to-drag for the parabolic polar.
        Returns 0 for a degenerate polar (zero drag) rather than dividing by it."""
        c0 = self.cd0_sub if cd0 is None else cd0
        d = self.k_induced * c0
        return 0.5 / math.sqrt(d) if d > 1e-15 else 0.0

    def cl_best_ld(self, cd0: Optional[float] = None) -> float:
        c0 = self.cd0_sub if cd0 is None else cd0
        k = self.k_induced
        return math.sqrt(c0 / k) if k > 1e-15 and c0 > 0.0 else 0.0


# --------------------------------------------------------------------------
# Atmosphere
# --------------------------------------------------------------------------

@dataclass
class AtmosphereSpec:
    delta_isa_k: float = 0.0        # non-standard day temperature offset, K
    headwind_ms: float = 0.0        # +ve = headwind, reduces ground speed
    ground_altitude_m: float = 0.0  # launch site elevation


# --------------------------------------------------------------------------
# Launch
# --------------------------------------------------------------------------

@dataclass
class BoosterSpec:
    enabled: bool = True
    thrust_n: float = 2500.0        # sized by solve_booster() for a 3 m rail at 13.5 kg gross
    burn_time_s: float = 0.19       # 475 N s total impulse
    mass_kg: float = 0.40           # motor + case; ~0.22 kg propellant at Isp 200 s
    jettison: bool = True
    x_booster_m: float = 1.10       # station of the booster mass, kept near the CG
                                    # so the motor does not destabilise the aircraft
                                    # during the rail run


@dataclass
class LaunchSpec:
    rail_length_m: float = 3.0
    rail_angle_deg: float = 45.0
    rail_friction_mu: float = 0.05
    exit_margin: float = 1.15       # required V_exit / V_stall
    engine_prespooled: bool = True  # engine brought to commanded throttle before release
    booster: BoosterSpec = field(default_factory=BoosterSpec)


# --------------------------------------------------------------------------
# Mission profile
# --------------------------------------------------------------------------

@dataclass
class MissionProfile:
    mission_distance_km: float = 50.0
    cruise_altitude_m: float = 3000.0
    climb_rate_ms: float = 30.0
    target_mach: float = 0.55
    descent_rate_ms: float = 25.0
    descent_throttle: float = 0.25  # throttle held on the descent leg
    reserve_frac: float = 0.15      # fraction of cruise fuel held in reserve
    auto_profile: bool = True       # derive descent_start_s / duration_s from the range
    descent_start_s: float = 230.0  # used when auto_profile is False
    end_altitude_m: float = 500.0
    duration_s: float = 300.0       # used when auto_profile is False
    auto_fuel: bool = True          # size fuel from range; else use fuel_mass_kg
    fuel_mass_kg: float = 2.90      # used when auto_fuel is False


# --------------------------------------------------------------------------
# Control
# --------------------------------------------------------------------------

@dataclass
class ControlSpec:
    """Throttle is commanded directly. Altitude is tracked by a flight-path controller."""
    throttle_schedule: Optional[List[ScheduleNode]] = None   # None -> built from the profile plan
    altitude_schedule: Optional[List[ScheduleNode]] = None   # None -> built from MissionProfile
    heading_schedule: Optional[List[ScheduleNode]] = None    # deg, None -> straight track
    k_gamma: float = 1.0            # 1/s, flight-path angle loop gain
    k_alt: float = 0.06             # 1/s, altitude error -> commanded climb rate
    n_max: float = 4.0              # structural load factor limit


# --------------------------------------------------------------------------
# Integration
# --------------------------------------------------------------------------

@dataclass
class IntegrationSpec:
    dt: float = 0.005               # s, fixed RK4 step
    output_hz: float = 50.0         # sample rate of the returned trajectory
    stop_on_ground: bool = True


# --------------------------------------------------------------------------
# Engine profile lives in engine.py but is part of the spec; imported there to
# avoid a circular import. Declared here as a forward reference for the schema
# walker via `MissionSpec.__annotations__`.
# --------------------------------------------------------------------------

from .engine import EngineProfile  # noqa: E402  (deliberate: schema is the aggregation point)


@dataclass
class ResumeState:
    """Splice point for an interactive re-solve. When present the solver skips the
    rail phase and integrates forward from this state, so moving the throttle lever
    at t = 150 s costs half of a full re-solve."""
    t: float
    v_tas_ms: float
    gamma_deg: float
    h_m: float
    x_m: float
    y_m: float
    s_ground_m: float
    fuel_kg: float
    throttle_act: float
    psi_deg: float = 0.0


@dataclass
class MissionSpec:
    airframe: AirframeSpec = field(default_factory=AirframeSpec)
    engine: EngineProfile = field(default_factory=EngineProfile)
    atmosphere: AtmosphereSpec = field(default_factory=AtmosphereSpec)
    launch: LaunchSpec = field(default_factory=LaunchSpec)
    mission: MissionProfile = field(default_factory=MissionProfile)
    control: ControlSpec = field(default_factory=ControlSpec)
    integration: IntegrationSpec = field(default_factory=IntegrationSpec)
    resume: Optional[ResumeState] = None
    label: str = "MSN-0417"
    config_name: str = "CONFIG B"


# --------------------------------------------------------------------------
# Results
# --------------------------------------------------------------------------

@dataclass
class FlightEvent:
    t: float
    kind: str          # rail_exit | booster_burnout | booster_jettison | top_of_climb |
                       # mach_dd_cross | mach_dd_exit | stall_onset | stall_clear |
                       # flameout | target_range | ground_impact | end_of_run
    label: str
    severity: str = "info"   # info | warn | alert
    detail: str = ""


@dataclass
class ProfilePlan:
    """Mission timeline derived from the requested range. Every time in the
    generated schedules comes from here, so the schedules and the fuel budget
    describe the same flight."""
    h_exit_m: float
    t_climb_s: float
    t_cruise_s: float
    t_descent_s: float
    t_toc_s: float
    t_descent_start_s: float
    duration_s: float
    climb_tas_ms: float
    cruise_tas_ms: float
    descent_tas_ms: float
    climb_throttle: float
    cruise_throttle: float
    descent_throttle: float
    climb_limited: bool = False
    note: str = ""


@dataclass
class ResolvedProfile:
    """Schedules actually flown, after defaults were generated. The UI edits these."""
    plan: ProfilePlan
    throttle_schedule: List[ScheduleNode]
    altitude_schedule: List[ScheduleNode]


@dataclass
class FuelBudget:
    """Output of the range -> fuel sizing calculation."""
    requested_range_km: float
    fuel_climb_kg: float
    fuel_cruise_kg: float
    fuel_descent_kg: float
    fuel_reserve_kg: float
    fuel_required_kg: float
    fuel_loaded_kg: float
    fuel_capacity_kg: float
    feasible: bool
    max_range_at_capacity_km: float
    cruise_ld: float
    cruise_tas_ms: float
    cruise_throttle: float
    climb_distance_km: float
    cruise_distance_km: float
    descent_distance_km: float
    note: str = ""


@dataclass
class LaunchFeasibility:
    v_exit_ms: float
    v_stall_ms: float
    v_required_ms: float
    margin_ratio: float          # v_exit / v_stall
    feasible: bool
    rail_time_s: float
    gross_mass_kg: float
    booster_thrust_n: float
    booster_impulse_ns: float
    booster_burn_time_s: float
    peak_rail_accel_g: float
    note: str = ""


@dataclass
class MachSweepPoint:
    mach: float
    thrust_available_n: float
    drag_required_n: float
    cl: float
    cd: float
    excess_n: float


@dataclass
class Mach1Deficit:
    """Thrust available vs thrust required at M = 1.0 for the current configuration."""
    altitude_m: float
    mass_kg: float
    tas_at_mach1_ms: float
    thrust_required_n: float
    thrust_available_n: float
    deficit_n: float
    deficit_ratio: float          # required / available
    max_level_mach: float
    max_level_tas_ms: float
    cd_at_mach1: float
    note: str = ""


@dataclass
class TrajectorySummary:
    ok: bool
    solve_ms: float
    n_samples: int
    duration_s: float
    gross_mass_kg: float
    fuel_loaded_kg: float
    fuel_burned_kg: float
    fuel_remaining_kg: float
    max_mach: float
    max_tas_ms: float
    max_altitude_m: float
    max_q_pa: float
    max_load_factor: float
    ground_range_km: float
    time_to_cruise_s: float
    best_ld: float
    min_static_margin: float
    wave_drag_entered: bool
    stalled: bool
    flameout: bool
    ground_impact: bool
    target_range_met: bool
    termination: str
    endurance_s: float


@dataclass
class Trajectory:
    """Columnar 50 Hz state history. Columns are parallel arrays of equal length."""
    t: List[float] = field(default_factory=list)
    x_m: List[float] = field(default_factory=list)          # ground track east
    y_m: List[float] = field(default_factory=list)          # ground track north
    s_ground_m: List[float] = field(default_factory=list)   # ground path length
    h_m: List[float] = field(default_factory=list)
    v_tas_ms: List[float] = field(default_factory=list)
    v_ground_ms: List[float] = field(default_factory=list)
    mach: List[float] = field(default_factory=list)
    gamma_deg: List[float] = field(default_factory=list)
    psi_deg: List[float] = field(default_factory=list)
    bank_deg: List[float] = field(default_factory=list)
    roc_ms: List[float] = field(default_factory=list)
    mass_kg: List[float] = field(default_factory=list)
    fuel_kg: List[float] = field(default_factory=list)
    fuel_flow_kgs: List[float] = field(default_factory=list)
    throttle_cmd: List[float] = field(default_factory=list)
    throttle_act: List[float] = field(default_factory=list)
    thrust_n: List[float] = field(default_factory=list)
    drag_n: List[float] = field(default_factory=list)
    lift_n: List[float] = field(default_factory=list)
    thrust_margin_n: List[float] = field(default_factory=list)
    ps_ms: List[float] = field(default_factory=list)         # specific excess power
    cl: List[float] = field(default_factory=list)
    cd: List[float] = field(default_factory=list)
    cd0: List[float] = field(default_factory=list)
    cdi: List[float] = field(default_factory=list)
    cd_wave: List[float] = field(default_factory=list)
    ld: List[float] = field(default_factory=list)
    q_pa: List[float] = field(default_factory=list)
    load_factor: List[float] = field(default_factory=list)
    rho: List[float] = field(default_factory=list)
    a_sound_ms: List[float] = field(default_factory=list)
    temp_k: List[float] = field(default_factory=list)
    press_pa: List[float] = field(default_factory=list)
    reynolds: List[float] = field(default_factory=list)
    x_cg_m: List[float] = field(default_factory=list)
    static_margin: List[float] = field(default_factory=list)
    wave_drag_active: List[int] = field(default_factory=list)
    stall_limited: List[int] = field(default_factory=list)
    lift_limited: List[int] = field(default_factory=list)
    phase: List[int] = field(default_factory=list)           # 0 rail 1 climb 2 cruise 3 descent


@dataclass
class SimulationResult:
    summary: TrajectorySummary
    trajectory: Trajectory
    events: List[FlightEvent]
    fuel: FuelBudget
    launch: LaunchFeasibility
    mach1: Mach1Deficit
    mach_sweep: List[MachSweepPoint]
    resolved: ResolvedProfile
    derived: "Derived"
    spec: MissionSpec
    warnings: List[str] = field(default_factory=list)


PHASE_NAMES = ["rail", "climb", "cruise", "descent"]


# --------------------------------------------------------------------------
# Generic dataclass <-> JSON
# --------------------------------------------------------------------------

def _unwrap_optional(tp):
    if get_origin(tp) is not None and type(None) in get_args(tp):
        args = [a for a in get_args(tp) if a is not type(None)]
        if len(args) == 1:
            return args[0], True
    return tp, False


def _coerce(tp, value, module_ns):
    tp, optional = _unwrap_optional(tp)
    if value is None:
        return None
    origin = get_origin(tp)
    if origin in (list, List):
        (inner,) = get_args(tp)
        return [_coerce(inner, v, module_ns) for v in value]
    if is_dataclass(tp):
        return from_dict(tp, value)
    if tp is float:
        return float(value)
    if tp is int:
        return int(value)
    if tp is bool:
        return bool(value)
    if tp is str:
        return str(value)
    return value


def from_dict(cls, data: Dict[str, Any]):
    """Build a dataclass from a plain dict, ignoring unknown keys and filling defaults."""
    if data is None:
        return cls()
    hints = get_type_hints(cls, globalns=globals())
    kwargs = {}
    for f in fields(cls):
        if f.name in data:
            kwargs[f.name] = _coerce(hints[f.name], data[f.name], globals())
    return cls(**kwargs)


def to_dict(obj, ndigits: Optional[int] = None):
    """Recursively convert dataclasses to plain JSON-safe structures."""
    if is_dataclass(obj):
        return {f.name: to_dict(getattr(obj, f.name), ndigits) for f in fields(obj)}
    if isinstance(obj, (list, tuple)):
        return [to_dict(v, ndigits) for v in obj]
    if isinstance(obj, float):
        if obj != obj or obj in (float("inf"), float("-inf")):
            return None
        return round(obj, ndigits) if ndigits is not None else obj
    return obj


def spec_from_json(raw: str | bytes | Dict[str, Any]) -> MissionSpec:
    if isinstance(raw, (str, bytes)):
        raw = json.loads(raw)
    return from_dict(MissionSpec, raw or {})


# --------------------------------------------------------------------------
# Editable-parameter metadata.
#
# The "Model parameters" drawer needs a range and a step for every constant it
# exposes. Those live here, beside the defaults, so the interface never invents
# a limit the solver has not agreed to. Paths are dotted from MissionSpec.
# Anything not listed is still editable, just without a slider range.
# --------------------------------------------------------------------------

FIELD_RANGES: Dict[str, tuple] = {
    # mission
    "mission.mission_distance_km": (5.0, 150.0, 1.0),
    "mission.cruise_altitude_m": (200.0, 11000.0, 50.0),
    "mission.climb_rate_ms": (2.0, 60.0, 1.0),
    "mission.descent_rate_ms": (2.0, 60.0, 1.0),
    "mission.target_mach": (0.10, 0.95, 0.005),
    "mission.descent_throttle": (0.0, 1.0, 0.01),
    "mission.reserve_frac": (0.0, 0.50, 0.01),
    "mission.end_altitude_m": (0.0, 6000.0, 50.0),
    "mission.fuel_mass_kg": (0.0, 6.0, 0.01),
    "mission.duration_s": (10.0, 1200.0, 5.0),
    "mission.descent_start_s": (5.0, 1200.0, 1.0),
    # airframe
    "airframe.wing_area_m2": (0.10, 0.60, 0.005),
    "airframe.span_m": (0.60, 2.20, 0.01),
    "airframe.mac_m": (0.10, 0.60, 0.001),
    "airframe.length_m": (1.00, 4.00, 0.01),
    "airframe.cd0_sub": (0.010, 0.060, 0.0005),
    "airframe.mach_dd": (0.50, 0.95, 0.005),
    "airframe.dcd_wave": (0.0, 0.150, 0.001),
    "airframe.wave_width": (0.01, 0.20, 0.005),
    "airframe.oswald_e": (0.40, 0.98, 0.01),
    "airframe.cl_max": (0.40, 1.60, 0.01),
    "airframe.mass_airframe_kg": (2.0, 15.0, 0.1),
    "airframe.mass_engine_kg": (1.0, 8.0, 0.1),
    "airframe.mass_avionics_kg": (0.5, 5.0, 0.05),
    "airframe.mass_payload_kg": (0.0, 3.0, 0.05),
    "airframe.fuel_capacity_kg": (0.5, 6.0, 0.05),
    "airframe.x_airframe_m": (0.0, 4.0, 0.01),
    "airframe.x_engine_m": (0.0, 4.0, 0.01),
    "airframe.x_avionics_m": (0.0, 4.0, 0.01),
    "airframe.x_payload_m": (0.0, 4.0, 0.01),
    "airframe.x_fuel_m": (0.0, 4.0, 0.01),
    "airframe.x_np_m": (0.0, 4.0, 0.01),
    "airframe.static_margin_min": (0.0, 0.25, 0.005),
    "airframe.planform_area_tolerance": (0.005, 0.25, 0.005),
    # planform geometry
    "airframe.planform.sweep_inboard_deg": (35.0, 80.0, 0.5),
    "airframe.planform.sweep_outer_deg": (10.0, 70.0, 0.5),
    "airframe.planform.crank_frac": (0.20, 0.95, 0.01),
    "airframe.planform.radome_frac": (0.10, 0.50, 0.01),
    "airframe.planform.body_halfwidth_frac": (0.05, 0.60, 0.01),
    "airframe.planform.te_notch_halfwidth_frac": (0.0, 0.35, 0.01),
    "airframe.planform.te_notch_depth_frac": (0.0, 0.30, 0.005),
    "airframe.planform.tip_chord_frac": (0.10, 1.00, 0.01),
    "airframe.planform.thickness_root_frac": (0.05, 0.25, 0.005),
    "airframe.planform.thickness_tip_frac": (0.03, 0.20, 0.005),
    "airframe.planform.twist_root_deg": (-6.0, 6.0, 0.1),
    "airframe.planform.twist_tip_deg": (-8.0, 4.0, 0.1),
    "airframe.planform.inlet_start_frac": (0.20, 0.80, 0.01),
    "airframe.planform.inlet_length_frac": (0.05, 0.40, 0.01),
    "airframe.planform.engine_radius_frac": (0.02, 0.15, 0.005),
    "airframe.planform.fin_span_frac": (0.0, 0.30, 0.01),
    "airframe.planform.fin_station_frac": (0.20, 0.95, 0.01),
    # engine
    "engine.mdot_0": (0.10, 1.50, 0.005),
    "engine.ve": (250.0, 900.0, 1.0),
    "engine.ram_k": (0.0, 1.20, 0.01),
    "engine.ram_mach_clamp": (0.5, 2.5, 0.05),
    "engine.idle_frac": (0.0, 0.40, 0.005),
    "engine.spool_exp": (0.5, 3.0, 0.05),
    "engine.tau_up_s": (0.1, 8.0, 0.1),
    "engine.tau_down_s": (0.1, 8.0, 0.1),
    "engine.tsfc_base": (0.05, 0.40, 0.001),
    "engine.tsfc_throttle_k": (0.0, 1.50, 0.01),
    # atmosphere
    "atmosphere.delta_isa_k": (-30.0, 40.0, 1.0),
    "atmosphere.headwind_ms": (-40.0, 40.0, 1.0),
    "atmosphere.ground_altitude_m": (0.0, 3000.0, 10.0),
    # launch
    "launch.rail_length_m": (1.0, 12.0, 0.1),
    "launch.rail_angle_deg": (10.0, 80.0, 1.0),
    "launch.rail_friction_mu": (0.0, 0.30, 0.005),
    "launch.exit_margin": (1.00, 1.60, 0.01),
    "launch.booster.thrust_n": (0.0, 8000.0, 25.0),
    "launch.booster.burn_time_s": (0.02, 2.00, 0.01),
    "launch.booster.mass_kg": (0.0, 2.0, 0.01),
    "launch.booster.x_booster_m": (0.0, 4.0, 0.01),
    # control
    "control.k_gamma": (0.1, 4.0, 0.05),
    "control.k_alt": (0.005, 0.40, 0.005),
    "control.n_max": (1.5, 9.0, 0.1),
    # integration
    "integration.dt": (0.001, 0.02, 0.001),
    "integration.output_hz": (10.0, 200.0, 5.0),
}
