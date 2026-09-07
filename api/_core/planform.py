"""ACT-1 planform: stations, outline and the reference-geometry check.

The measurements themselves live in geometry_ratios.py, which has no imports so
the specification can use it too. This module turns them into the spanwise
stations the viewport lofts from and the study page reads its span load from,
and refuses a solve whose reference geometry does not match the drawn shape.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import List, Tuple

from .geometry_ratios import (
    AREA_OVER_L2, ASPECT_RATIO, CHORD_BY_ETA, CRANK_STATION, DerivedGeometry,
    GEOMETRY_TOLERANCE, HALF_SPAN_BY_STATION, MAC_OVER_L, RADOME_STATION,
    SPAN_OVER_L, _interp, chord_over_l, derive, le_station,
)
from .schema import AirframeSpec, PlanformSpec


class GeometryMismatch(ValueError):
    """A supplied span or area does not match the shape the solver would draw."""


def validate_or_raise(af: AirframeSpec) -> DerivedGeometry:
    """Refuse to solve against a reference geometry the planform does not have.

    The induced-drag factor is 1 / (pi AR e). A span or area that disagrees with
    the drawn shape puts AR wrong, and every range, endurance and L/D figure
    downstream is wrong with it - silently. This turns that into a failure.
    """
    d = derive(af.length_m)
    problems: List[str] = []
    for label, supplied, expected in (
        ("span_m", af.span_m, d.span_m),
        ("wing_area_m2", af.wing_area_m2, d.area_m2),
        ("mac_m", af.mac_m, d.mac_m),
    ):
        if expected <= 1e-9:
            continue
        err = (supplied - expected) / expected
        if abs(err) > GEOMETRY_TOLERANCE:
            problems.append(
                f"{label} is {supplied:.4f} but the measured planform at "
                f"length_m {af.length_m:.3f} gives {expected:.4f} ({err * 100:+.1f}%)")
    if problems:
        raise GeometryMismatch(
            "The supplied reference geometry does not match the drawn planform. "
            + "; ".join(problems)
            + f". Overall length is the only dimensional input: span, area and mean chord are "
              f"measured ratios of it (b/L {SPAN_OVER_L:.3f}, S/L2 {AREA_OVER_L2:.3f}, "
              f"MAC/L {MAC_OVER_L:.3f}, AR {ASPECT_RATIO:.2f}). Set length_m and let the rest "
              f"follow, or the drag polar is referenced to a shape the aircraft does not have.")
    return d




# --------------------------------------------------------------------------
# Stations and outline
# --------------------------------------------------------------------------

@dataclass
class SpanStation:
    y_m: float
    eta: float
    le_x_m: float
    te_x_m: float
    chord_m: float
    thickness_frac: float
    twist_deg: float
    schrenk_load: float
    elliptic_load: float
    departure: float


@dataclass
class Planform:
    span_m: float
    length_m: float
    area_m2: float
    mac_m: float
    aspect_ratio: float
    root_chord_m: float
    tip_chord_m: float
    crank_y_m: float
    crank_x_m: float
    tip_le_x_m: float
    taper_ratio: float
    span_over_l: float
    area_over_l2: float
    mac_over_l: float
    measured: bool = True
    outline: List[Tuple[float, float]] = field(default_factory=list)
    stations: List[SpanStation] = field(default_factory=list)


def build(af: AirframeSpec, n_stations: int = 41) -> Planform:
    pf: PlanformSpec = af.planform
    L = max(1e-6, af.length_m)
    d = derive(L)
    half = d.span_m / 2.0

    stations: List[SpanStation] = []
    ell_scale = (4.0 * d.area_m2) / (math.pi * d.span_m) if d.span_m > 1e-9 else 0.0
    mean_chord = d.area_m2 / d.span_m if d.span_m > 1e-9 else 1.0
    for i in range(n_stations):
        eta = i / (n_stations - 1)
        le = le_station(eta) * L
        c = chord_over_l(eta) * L
        ell = ell_scale * math.sqrt(max(0.0, 1.0 - eta * eta))
        schrenk = 0.5 * (c + ell)
        stations.append(SpanStation(
            y_m=eta * half, eta=eta, le_x_m=le, te_x_m=le + c, chord_m=c,
            thickness_frac=pf.thickness_root_frac
            + (pf.thickness_tip_frac - pf.thickness_root_frac) * eta,
            twist_deg=pf.twist_root_deg + (pf.twist_tip_deg - pf.twist_root_deg) * eta,
            schrenk_load=schrenk / mean_chord if mean_chord > 1e-9 else 0.0,
            elliptic_load=ell / mean_chord if mean_chord > 1e-9 else 0.0,
            departure=(schrenk - ell) / ell if ell > 1e-9 else 0.0,
        ))

    outline: List[Tuple[float, float]] = []
    n_edge = 32
    for i in range(n_edge + 1):
        eta = i / n_edge
        outline.append((le_station(eta) * L, eta * half))
    for i in range(n_edge, -1, -1):
        eta = i / n_edge
        outline.append(((le_station(eta) + chord_over_l(eta)) * L, eta * half))

    return Planform(
        span_m=d.span_m, length_m=L, area_m2=d.area_m2, mac_m=d.mac_m,
        aspect_ratio=d.aspect_ratio,
        root_chord_m=chord_over_l(0.0) * L,
        tip_chord_m=chord_over_l(1.0) * L,
        crank_y_m=_interp(HALF_SPAN_BY_STATION, CRANK_STATION) * L,
        crank_x_m=CRANK_STATION * L,
        tip_le_x_m=le_station(1.0) * L,
        taper_ratio=chord_over_l(1.0) / max(1e-9, chord_over_l(0.0)),
        span_over_l=d.span_over_l, area_over_l2=d.area_over_l2, mac_over_l=d.mac_over_l,
        outline=outline, stations=stations,
    )


# --------------------------------------------------------------------------
# Reconciliation, kept for the console readout
# --------------------------------------------------------------------------

@dataclass
class Reconciliation:
    drawn_area_m2: float
    reference_area_m2: float
    area_error: float
    drawn_aspect_ratio: float
    reference_aspect_ratio: float
    drawn_mac_m: float
    reference_mac_m: float
    mac_error: float
    span_length_ratio: float
    cad_span_length_ratio: float
    span_length_error: float
    tolerance: float
    consistent: bool
    ld_max_reference: float
    ld_max_drawn: float
    warnings: List[str] = field(default_factory=list)


def reconcile(af: AirframeSpec, pl: Planform | None = None) -> Reconciliation:
    pl = pl or build(af)
    ref_area = af.wing_area_m2
    area_err = (pl.area_m2 - ref_area) / ref_area if ref_area > 1e-9 else 0.0
    mac_err = (pl.mac_m - af.mac_m) / af.mac_m if af.mac_m > 1e-9 else 0.0
    sl = af.span_m / af.length_m if af.length_m > 1e-9 else 0.0
    sl_err = (sl - SPAN_OVER_L) / SPAN_OVER_L

    def ld(area: float) -> float:
        ar = (af.span_m * af.span_m / area) if area > 1e-9 else 0.0
        k = 1.0 / (math.pi * ar * af.oswald_e) if ar > 1e-9 else 0.0
        prod = k * af.cd0_sub
        return 0.5 / math.sqrt(prod) if prod > 1e-15 else 0.0

    tol = GEOMETRY_TOLERANCE
    warnings: List[str] = []
    if abs(area_err) > tol:
        warnings.append(
            f"Drawn planform encloses {pl.area_m2:.3f} m2; the drag polar is referenced to "
            f"{ref_area:.3f} m2 ({area_err * 100:+.0f}%). The solve will refuse to run.")
    if abs(mac_err) > tol:
        warnings.append(
            f"Drawn mean aerodynamic chord is {pl.mac_m:.3f} m against {af.mac_m:.3f} m in the "
            f"spec ({mac_err * 100:+.0f}%). Static margin is quoted in percent MAC.")
    if abs(sl_err) > tol:
        warnings.append(
            f"Span to length is {sl:.3f} against {SPAN_OVER_L:.3f} measured from the render "
            f"({sl_err * 100:+.0f}%).")

    return Reconciliation(
        drawn_area_m2=pl.area_m2, reference_area_m2=ref_area, area_error=area_err,
        drawn_aspect_ratio=pl.aspect_ratio, reference_aspect_ratio=af.aspect_ratio,
        drawn_mac_m=pl.mac_m, reference_mac_m=af.mac_m, mac_error=mac_err,
        span_length_ratio=sl, cad_span_length_ratio=SPAN_OVER_L,
        span_length_error=sl_err, tolerance=tol, consistent=not warnings,
        ld_max_reference=ld(ref_area), ld_max_drawn=ld(pl.area_m2), warnings=warnings,
    )
