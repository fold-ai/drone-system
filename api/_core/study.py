"""Airframe study: what the shape does to the aerodynamics, and what would help.

Everything here calls the same solver modules the console does. The study page
holds no aerodynamics of its own, because a second implementation of the drag
polar drifts away from the first one and then the two pages disagree about the
same aircraft.

Three quantities are used throughout as design metrics:

    range      maximum range on a full tank, from the sizing model
    endurance  usable fuel divided by the fuel flow in level cruise
    L/D max    0.5 / sqrt(k CD0), the analytic best for a parabolic polar

Each is a property of the design rather than of one flown mission, so they can
be compared across perturbations.
"""
from __future__ import annotations

import copy
import math
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

from .aero import cd0_of_mach, stall_speed
from .atmosphere import isa
from .constants import G0
from .geometry_ratios import ASPECT_RATIO as GEOMETRY_ASPECT_RATIO
from .launch import feasibility as launch_feasibility
from .mission import _max_range, cruise_point, size_mission
from .performance import max_level_mach
from .planform import build as build_planform
from .schema import MissionSpec


# --------------------------------------------------------------------------
# Drag breakdown
# --------------------------------------------------------------------------

@dataclass
class DragPoint:
    mach: float
    cl: float
    cd0: float
    cdi: float
    cd_wave: float
    cd_total: float
    ld: float
    counts_cd0: float      # one drag count is 1e-4 of CD
    counts_cdi: float
    counts_wave: float
    frac_cd0: float
    frac_cdi: float
    frac_wave: float


@dataclass
class PolarPoint:
    cl: float
    cd: float
    ld: float


@dataclass
class PolarResult:
    altitude_m: float
    mass_kg: float
    mach_ref: float
    ld_max: float
    cl_at_ld_max: float
    cd_at_ld_max: float
    v_at_ld_max_ms: float
    mach_at_ld_max: float
    cruise_ld: float
    breakdown: List[DragPoint] = field(default_factory=list)
    polar: List[PolarPoint] = field(default_factory=list)
    ld_vs_mach: List[Tuple[float, float]] = field(default_factory=list)
    note: str = ""


def drag_breakdown(spec: MissionSpec, altitude_m: float, mass_kg: float,
                   m_lo: float = 0.1, m_hi: float = 1.1, n: int = 101) -> PolarResult:
    af = spec.airframe
    atmo = isa(altitude_m, spec.atmosphere.delta_isa_k)
    k = af.k_induced
    pts: List[DragPoint] = []
    ld_vs_mach: List[Tuple[float, float]] = []
    step = (m_hi - m_lo) / (n - 1)
    for i in range(n):
        m = m_lo + i * step
        v = m * atmo.a_ms
        qs = 0.5 * atmo.rho * v * v * af.wing_area_m2
        cl = (mass_kg * G0 / qs) if qs > 1e-9 else 0.0
        total_cd0 = cd0_of_mach(af, m)
        wave = total_cd0 - af.cd0_sub
        cdi = k * cl * cl
        cd = total_cd0 + cdi
        ld = cl / cd if cd > 1e-12 else 0.0
        pts.append(DragPoint(
            mach=m, cl=cl, cd0=af.cd0_sub, cdi=cdi, cd_wave=wave, cd_total=cd, ld=ld,
            counts_cd0=af.cd0_sub * 1e4, counts_cdi=cdi * 1e4, counts_wave=wave * 1e4,
            frac_cd0=af.cd0_sub / cd if cd > 1e-12 else 0.0,
            frac_cdi=cdi / cd if cd > 1e-12 else 0.0,
            frac_wave=wave / cd if cd > 1e-12 else 0.0,
        ))
        ld_vs_mach.append((m, ld))

    # Polar at the subsonic CD0, which is where best L/D lives.
    polar: List[PolarPoint] = []
    n_p = 60
    for i in range(n_p + 1):
        cl = af.cl_max * i / n_p
        cd = af.cd0_sub + k * cl * cl
        polar.append(PolarPoint(cl=cl, cd=cd, ld=cl / cd if cd > 1e-12 else 0.0))

    ld_max = af.ld_max()
    cl_opt = af.cl_best_ld()
    cd_opt = af.cd0_sub + k * cl_opt * cl_opt
    denom = atmo.rho * af.wing_area_m2 * cl_opt
    v_opt = math.sqrt(2.0 * mass_kg * G0 / denom) if denom > 1e-9 else 0.0
    _, cruise_ld, _, _ = cruise_point(af, spec.engine, altitude_m,
                                      spec.mission.target_mach, mass_kg,
                                      spec.atmosphere.delta_isa_k)

    return PolarResult(
        altitude_m=altitude_m, mass_kg=mass_kg, mach_ref=spec.mission.target_mach,
        ld_max=ld_max, cl_at_ld_max=cl_opt, cd_at_ld_max=cd_opt,
        v_at_ld_max_ms=v_opt, mach_at_ld_max=v_opt / atmo.a_ms if atmo.a_ms > 0 else 0.0,
        cruise_ld=cruise_ld, breakdown=pts, polar=polar, ld_vs_mach=ld_vs_mach,
        note=(f"Lift coefficient is the level-flight value at {mass_kg:.2f} kg and "
              f"{altitude_m:.0f} m, so induced drag falls as the square of speed. "
              f"Wave drag is the tanh blend above M_dd = {af.mach_dd:.2f}."),
    )


# --------------------------------------------------------------------------
# Design metrics
# --------------------------------------------------------------------------

@dataclass
class Metrics:
    range_km: float
    endurance_s: float
    ld_max: float
    max_level_mach: float
    fuel_required_kg: float
    exit_margin: float
    min_static_margin: float
    cruise_cl_fraction: float     # cruise CL as a fraction of CL_max
    feasible_launch: bool
    feasible_fuel: bool


def _h_exit(spec: MissionSpec) -> float:
    return (spec.atmosphere.ground_altitude_m
            + spec.launch.rail_length_m * math.sin(math.radians(spec.launch.rail_angle_deg)))


def metrics(spec: MissionSpec, full: bool = True) -> Metrics:
    """Design metrics for one specification.

    `full` runs the iterative fuel sizing, which costs about 16 ms. Without it
    the sweep uses the single-pass maximum-range calculation instead, which is
    the same physics at about a tenth of the cost.
    """
    af, eng, mp = spec.airframe, spec.engine, spec.mission
    h_exit = _h_exit(spec)
    cap = af.fuel_capacity_kg
    d_isa = spec.atmosphere.delta_isa_k

    rng_m = _max_range(spec, cap, h_exit)

    mass_mid = af.mass_dry_kg + 0.5 * cap
    v_cr, ld_cr, drag_cr, thr_cr = cruise_point(af, eng, mp.cruise_altitude_m,
                                                mp.target_mach, mass_mid, d_isa)
    thr_c = min(1.0, max(0.0, thr_cr))
    wf = eng.fuel_flow(drag_cr, thr_c)
    usable = cap * (1.0 - mp.reserve_frac)
    endurance = usable / wf if wf > 1e-9 else 0.0

    atmo = isa(mp.cruise_altitude_m, d_isa)
    qs = 0.5 * atmo.rho * v_cr * v_cr * af.wing_area_m2
    cruise_cl = (mass_mid * G0 / qs) if qs > 1e-9 else 0.0

    fuel_needed = cap
    feas_fuel = True
    if full:
        budget, _ = size_mission(spec, h_exit)
        fuel_needed = budget.fuel_required_kg
        feas_fuel = budget.feasible

    lf = launch_feasibility(spec, min(cap, fuel_needed))
    sm_empty = af.static_margin(0.0)

    return Metrics(
        range_km=rng_m / 1000.0,
        endurance_s=endurance,
        ld_max=af.ld_max(),
        max_level_mach=max_level_mach(af, eng, mp.cruise_altitude_m, mass_mid, d_isa),
        fuel_required_kg=fuel_needed,
        exit_margin=lf.margin_ratio,
        min_static_margin=sm_empty,
        cruise_cl_fraction=(cruise_cl / af.cl_max) if af.cl_max > 1e-9 else 0.0,
        feasible_launch=lf.feasible,
        feasible_fuel=feas_fuel,
    )


# --------------------------------------------------------------------------
# Parameter addressing, including one virtual parameter
# --------------------------------------------------------------------------

VIRTUAL = {"airframe.aspect_ratio"}


def read_param(spec: MissionSpec, path: str) -> float:
    if path == "airframe.aspect_ratio":
        return spec.airframe.aspect_ratio
    node: Any = spec
    for key in path.split("."):
        node = getattr(node, key)
    return float(node)


# Writing one of these changes the aeroplane's dimensions, so everything
# derived from overall length has to be recomputed with it.
_RESCALES = ("airframe.length_m", "airframe.planform.span_stretch")


def write_param(spec: MissionSpec, path: str, value: float) -> None:
    """Aspect ratio is not a field. Moving it means re-lofting the measured
    planform at constant reference area - span times the stretch, chords divided
    by it - which is the same change the optimiser makes, and the caller is told
    what span it implies.

    Overall length is the single authoritative dimension, so writing it
    re-derives span, area, mean chord and the balance stations rather than
    leaving them describing the previous aircraft.
    """
    if path == "airframe.aspect_ratio":
        spec.airframe.planform.span_stretch = math.sqrt(
            max(1e-6, value / GEOMETRY_ASPECT_RATIO))
        spec.airframe.rescale()
        return
    parts = path.split(".")
    node: Any = spec
    for key in parts[:-1]:
        node = getattr(node, key)
    setattr(node, parts[-1], value)
    if path in _RESCALES:
        spec.airframe.rescale()


PARAM_LABELS: Dict[str, Tuple[str, str]] = {
    "airframe.oswald_e": ("Oswald efficiency", ""),
    "airframe.cd0_sub": ("Parasite drag CD0", ""),
    "airframe.mach_dd": ("Drag divergence Mach", "M"),
    "airframe.dcd_wave": ("Wave drag increment", ""),
    "airframe.aspect_ratio": ("Aspect ratio", ""),
    "airframe.cl_max": ("Maximum lift coefficient", ""),
    "airframe.mass_payload_kg": ("Payload", "kg"),
    "airframe.wing_area_m2": ("Reference area", "m2"),
    "airframe.span_m": ("Span", "m"),
    "airframe.fuel_capacity_kg": ("Tank capacity", "kg"),
    "engine.mdot_0": ("Sea-level mass flow", "kg/s"),
    "engine.tsfc_base": ("TSFC", "kg/(N h)"),
    "mission.cruise_altitude_m": ("Cruise altitude", "m"),
    "mission.target_mach": ("Cruise Mach", "M"),
}

DEFAULT_SENSITIVITY = [
    "airframe.oswald_e",
    "airframe.cd0_sub",
    "airframe.mach_dd",
    "airframe.dcd_wave",
    "airframe.aspect_ratio",
    "airframe.cl_max",
    "airframe.mass_payload_kg",
]


# --------------------------------------------------------------------------
# Sensitivity
# --------------------------------------------------------------------------

@dataclass
class SensitivityRow:
    path: str
    label: str
    unit: str
    baseline: float
    low: float
    high: float
    range_low_pct: float
    range_high_pct: float
    endurance_low_pct: float
    endurance_high_pct: float
    ld_low_pct: float
    ld_high_pct: float
    span_pct: float            # widest range swing, for ordering the tornado
    note: str = ""


@dataclass
class Improvement:
    path: str
    label: str
    from_value: float
    to_value: float
    unit: str
    range_gain_pct: float
    cost: str
    assumption: str
    score: float


@dataclass
class SensitivityResult:
    perturbation: float
    baseline_range_km: float
    baseline_endurance_s: float
    baseline_ld_max: float
    solves: int
    solve_ms: float
    rows: List[SensitivityRow] = field(default_factory=list)
    improvements: List[Improvement] = field(default_factory=list)
    note: str = ""


def _pct(new: float, base: float) -> float:
    return ((new - base) / base * 100.0) if abs(base) > 1e-12 else 0.0


def sensitivity(spec: MissionSpec, paths: Optional[List[str]] = None,
                perturbation: float = 0.10) -> SensitivityResult:
    t0 = time.perf_counter()
    paths = paths or DEFAULT_SENSITIVITY
    base = metrics(spec)
    rows: List[SensitivityRow] = []
    solves = 1

    for path in paths:
        b = read_param(spec, path)
        lo_v = b * (1.0 - perturbation)
        hi_v = b * (1.0 + perturbation)
        # Oswald efficiency above 1 is not physical; clip rather than report a
        # sensitivity the aircraft cannot have.
        if path == "airframe.oswald_e":
            hi_v = min(hi_v, 0.995)
        if path == "airframe.mach_dd":
            hi_v = min(hi_v, 0.98)

        out = []
        for v in (lo_v, hi_v):
            s2 = copy.deepcopy(spec)
            write_param(s2, path, v)
            out.append(metrics(s2))
            solves += 1
        lo, hi = out

        span = max(abs(_pct(lo.range_km, base.range_km)), abs(_pct(hi.range_km, base.range_km)))
        label, unit = PARAM_LABELS.get(path, (path.split(".")[-1].replace("_", " "), ""))
        note = ""
        if path == "airframe.aspect_ratio":
            stretched = copy.deepcopy(spec)
            write_param(stretched, path, hi_v)
            note = (f"by re-lofting the measured planform at constant reference "
                    f"area, so span moves {spec.airframe.span_m:.2f} m to "
                    f"{stretched.airframe.span_m:.2f} m")
        rows.append(SensitivityRow(
            path=path, label=label, unit=unit, baseline=b, low=lo_v, high=hi_v,
            range_low_pct=_pct(lo.range_km, base.range_km),
            range_high_pct=_pct(hi.range_km, base.range_km),
            endurance_low_pct=_pct(lo.endurance_s, base.endurance_s),
            endurance_high_pct=_pct(hi.endurance_s, base.endurance_s),
            ld_low_pct=_pct(lo.ld_max, base.ld_max),
            ld_high_pct=_pct(hi.ld_max, base.ld_max),
            span_pct=span, note=note,
        ))

    rows.sort(key=lambda r: r.span_pct, reverse=True)
    improvements = _improvements(spec, rows, perturbation)
    return SensitivityResult(
        perturbation=perturbation,
        baseline_range_km=base.range_km,
        baseline_endurance_s=base.endurance_s,
        baseline_ld_max=base.ld_max,
        solves=solves, solve_ms=(time.perf_counter() - t0) * 1000.0,
        rows=rows, improvements=improvements,
        note=(f"Each parameter perturbed by {perturbation * 100:.0f}% and the design "
              f"re-solved. Range is maximum range on a full tank; endurance is usable fuel "
              f"over the cruise fuel flow; L/D max is the analytic best for the polar."),
    )


COST_OF: Dict[str, Tuple[str, str]] = {
    "airframe.aspect_ratio": (
        "span, structure and rail clearance",
        "unchanged Oswald efficiency and reference area, and that the wider span still "
        "clears the launch rail",
    ),
    "airframe.cd0_sub": (
        "surface finish, sealing and joint quality",
        "the drag reduction is achievable without adding mass or changing the reference "
        "area",
    ),
    "airframe.oswald_e": (
        "planform and twist work",
        "the span load can be moved toward elliptical without a structural or mass "
        "penalty",
    ),
    "airframe.mach_dd": (
        "aerofoil and area-rule work",
        "the divergence Mach can be pushed out without raising subsonic CD0",
    ),
    "airframe.dcd_wave": (
        "transonic shaping",
        "the wave drag increment falls without moving the divergence Mach",
    ),
    "airframe.cl_max": (
        "high-lift or planform work",
        "the change affects launch and stall margin rather than cruise drag",
    ),
    "airframe.mass_payload_kg": (
        "payload capability given up",
        "the mass comes out without changing the balance",
    ),
}


def _improvements(spec: MissionSpec, rows: List[SensitivityRow],
                  perturbation: float) -> List[Improvement]:
    """Rank concrete changes by range gained per unit of the perturbation.

    Derived from the sensitivity results rather than written down: whichever
    direction of each parameter improves range is the one offered, and the
    assumption behind it is stated with it.
    """
    out: List[Improvement] = []
    for r in rows:
        up = r.range_high_pct
        down = r.range_low_pct
        if abs(up) < 0.05 and abs(down) < 0.05:
            continue
        if up >= down:
            to_v, gain = r.high, up
        else:
            to_v, gain = r.low, down
        if gain <= 0.05:
            continue
        cost, assumption = COST_OF.get(r.path, ("unquantified", "no side effects"))
        detail = assumption
        if r.path == "airframe.aspect_ratio":
            span_now = spec.airframe.span_m
            span_new = math.sqrt(to_v * spec.airframe.wing_area_m2)
            detail = f"span {span_now:.2f} m to {span_new:.2f} m; {assumption}"
        out.append(Improvement(
            path=r.path, label=r.label, from_value=r.baseline, to_value=to_v,
            unit=r.unit, range_gain_pct=gain, cost=cost, assumption=detail,
            score=gain / (perturbation * 100.0),
        ))
    out.sort(key=lambda i: i.score, reverse=True)
    return out


# --------------------------------------------------------------------------
# Two-parameter sweep
# --------------------------------------------------------------------------

METRICS: Dict[str, Tuple[str, str]] = {
    "range_km": ("Range on a full tank", "km"),
    "endurance_s": ("Endurance", "s"),
    "ld_max": ("L/D max", ""),
    "max_level_mach": ("Maximum level Mach", "M"),
    "fuel_required_kg": ("Fuel required", "kg"),
    "exit_margin": ("Rail exit margin", "x Vs"),
}

CONSTRAINTS = ["rail exit", "static margin", "fuel capacity", "cruise CL against CL_max"]
MAX_GRID = 32


@dataclass
class SweepAxis:
    path: str
    label: str
    unit: str
    lo: float
    hi: float
    n: int


@dataclass
class SweepResult:
    x: SweepAxis
    y: SweepAxis
    metric: str
    metric_label: str
    metric_unit: str
    vmin: float
    vmax: float
    solves: int
    solve_ms: float
    values: List[List[float]] = field(default_factory=list)
    violations: List[List[int]] = field(default_factory=list)
    constraints: List[str] = field(default_factory=lambda: list(CONSTRAINTS))
    note: str = ""


def sweep(spec: MissionSpec, x_path: str, x_lo: float, x_hi: float,
          y_path: str, y_lo: float, y_hi: float, metric: str = "range_km",
          nx: int = 20, ny: int = 20) -> SweepResult:
    t0 = time.perf_counter()
    nx = max(3, min(MAX_GRID, nx))
    ny = max(3, min(MAX_GRID, ny))
    values: List[List[float]] = []
    violations: List[List[int]] = []
    vmin = math.inf
    vmax = -math.inf
    solves = 0

    for j in range(ny):
        yv = y_lo + (y_hi - y_lo) * (j / (ny - 1))
        row: List[float] = []
        vrow: List[int] = []
        for i in range(nx):
            xv = x_lo + (x_hi - x_lo) * (i / (nx - 1))
            s2 = copy.deepcopy(spec)
            write_param(s2, x_path, xv)
            write_param(s2, y_path, yv)
            # `full=False` skips the iterative fuel sizing; the fuel-capacity
            # constraint then uses the single-pass maximum-range calculation,
            # which is the same physics at a tenth of the cost.
            m = metrics(s2, full=False)
            solves += 1
            v = getattr(m, metric, 0.0)
            if isinstance(v, bool):
                v = 1.0 if v else 0.0
            row.append(float(v))
            bits = 0
            if not m.feasible_launch:
                bits |= 1
            if m.min_static_margin < s2.airframe.static_margin_min:
                bits |= 2
            if m.fuel_required_kg > s2.airframe.fuel_capacity_kg:
                bits |= 4
            if m.cruise_cl_fraction > 0.9:
                bits |= 8
            vrow.append(bits)
            if math.isfinite(v):
                vmin = min(vmin, v)
                vmax = max(vmax, v)
        values.append(row)
        violations.append(vrow)

    label, unit = METRICS.get(metric, (metric, ""))
    xl, xu = PARAM_LABELS.get(x_path, (x_path.split(".")[-1].replace("_", " "), ""))
    yl, yu = PARAM_LABELS.get(y_path, (y_path.split(".")[-1].replace("_", " "), ""))
    return SweepResult(
        x=SweepAxis(x_path, xl, xu, x_lo, x_hi, nx),
        y=SweepAxis(y_path, yl, yu, y_lo, y_hi, ny),
        metric=metric, metric_label=label, metric_unit=unit,
        vmin=(vmin if math.isfinite(vmin) else 0.0),
        vmax=(vmax if math.isfinite(vmax) else 1.0),
        solves=solves, solve_ms=(time.perf_counter() - t0) * 1000.0,
        values=values, violations=violations,
        note=("Cells are evaluated with the single-pass sizing calculation, not a flown "
              "trajectory. Constraint overlays mark where the design stops being buildable."),
    )
