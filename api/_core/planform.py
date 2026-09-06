"""ACT-1 planform: the one definition of the shape.

The 3D viewport lofts its surface from the outline this module produces, the
study page measures its area and span load from the same outline, and the
reconciliation below compares both against the reference area the drag polar is
written to. Defining the geometry twice - once in Python for analysis and once
in TypeScript for rendering - is how the drawn aircraft and the analysed
aircraft quietly stop being the same aircraft.

The shape is a cranked-delta blended wing body, working nose-forward:

    ogive radome  ->  chine  ->  inboard panel at ~67 deg  ->  crank
                  ->  outer panel at ~40 deg  ->  squared tip
    straight trailing edge, notched at the centreline for the exhaust

Nothing here is a solve. The span load is a Schrenk approximation and is
labelled as such wherever it is shown.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import List, Tuple

from .schema import AirframeSpec, PlanformSpec


@dataclass
class SpanStation:
    y_m: float
    eta: float                 # y / (b/2)
    le_x_m: float
    te_x_m: float
    chord_m: float
    thickness_frac: float
    twist_deg: float
    schrenk_load: float        # local lift per unit span, normalised to mean
    elliptic_load: float
    departure: float           # schrenk - elliptic, as a fraction of elliptic


@dataclass
class Planform:
    span_m: float
    length_m: float
    area_m2: float             # full planform area enclosed by the drawn outline
    mac_m: float
    aspect_ratio: float
    root_chord_m: float
    tip_chord_m: float
    crank_y_m: float
    crank_x_m: float
    tip_le_x_m: float
    taper_ratio: float
    outline: List[Tuple[float, float]] = field(default_factory=list)   # half planform, x aft, y out
    stations: List[SpanStation] = field(default_factory=list)


def _le_x(pf: PlanformSpec, y: float, half_span: float) -> float:
    """Leading edge station at spanwise position y."""
    t1 = math.tan(math.radians(pf.sweep_inboard_deg))
    t2 = math.tan(math.radians(pf.sweep_outer_deg))
    y_crank = pf.crank_frac * half_span
    if y <= y_crank:
        return y * t1
    return y_crank * t1 + (y - y_crank) * t2


def _te_x(af: AirframeSpec, pf: PlanformSpec, y: float, half_span: float) -> float:
    """Trailing edge station. Straight, cut forward by the exhaust notch inboard."""
    notch_y = pf.te_notch_halfwidth_frac * half_span
    if y < notch_y:
        return af.length_m - pf.te_notch_depth_frac * af.length_m
    return af.length_m


def build(af: AirframeSpec, n_stations: int = 41) -> Planform:
    pf = af.planform
    half = af.span_m * 0.5
    if half <= 1e-6 or af.length_m <= 1e-6:
        return Planform(af.span_m, af.length_m, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0)

    y_crank = pf.crank_frac * half
    x_crank = _le_x(pf, y_crank, half)
    x_tip_le = _le_x(pf, half, half)

    # --- area and mean aerodynamic chord, integrated over the semispan ------
    n_int = 400
    dy = half / n_int
    area_half = 0.0
    mac_num = 0.0
    for i in range(n_int):
        y = (i + 0.5) * dy
        c = _te_x(af, pf, y, half) - _le_x(pf, y, half)
        area_half += c * dy
        mac_num += c * c * dy
    area = 2.0 * area_half
    mac = mac_num / area_half if area_half > 1e-9 else 0.0

    root_chord = _te_x(af, pf, 0.0, half) - _le_x(pf, 0.0, half)
    tip_chord = (af.length_m - x_tip_le) * pf.tip_chord_frac
    ar = (af.span_m * af.span_m / area) if area > 1e-9 else 0.0

    # --- outline, half planform, leading edge outboard then trailing edge in --
    outline: List[Tuple[float, float]] = []
    n_le = 24
    for i in range(n_le + 1):
        y = half * i / n_le
        outline.append((_le_x(pf, y, half), y))
    outline.append((af.length_m - (1.0 - pf.tip_chord_frac) * (af.length_m - x_tip_le), half))
    n_te = 12
    for i in range(n_te + 1):
        y = half * (1.0 - i / n_te)
        outline.append((_te_x(af, pf, y, half), y))

    # --- span load, Schrenk approximation -----------------------------------
    # Local lift is taken as the mean of the chord distribution and the
    # elliptical distribution of the same area. It is an approximation, not a
    # lifting-line solve, and every view that shows it says so.
    stations: List[SpanStation] = []
    ell_scale = (4.0 * area) / (math.pi * af.span_m) if af.span_m > 1e-9 else 0.0
    mean_chord = area / af.span_m if af.span_m > 1e-9 else 1.0
    for i in range(n_stations):
        eta = i / (n_stations - 1)
        y = eta * half
        le = _le_x(pf, y, half)
        te = _te_x(af, pf, y, half)
        c = max(0.0, te - le)
        ell = ell_scale * math.sqrt(max(0.0, 1.0 - eta * eta))
        schrenk = 0.5 * (c + ell)
        stations.append(SpanStation(
            y_m=y, eta=eta, le_x_m=le, te_x_m=te, chord_m=c,
            thickness_frac=pf.thickness_root_frac
            + (pf.thickness_tip_frac - pf.thickness_root_frac) * eta,
            twist_deg=pf.twist_root_deg + (pf.twist_tip_deg - pf.twist_root_deg) * eta,
            schrenk_load=schrenk / mean_chord,
            elliptic_load=ell / mean_chord,
            departure=(schrenk - ell) / ell if ell > 1e-9 else 0.0,
        ))

    return Planform(
        span_m=af.span_m, length_m=af.length_m, area_m2=area, mac_m=mac,
        aspect_ratio=ar, root_chord_m=root_chord, tip_chord_m=tip_chord,
        crank_y_m=y_crank, crank_x_m=x_crank, tip_le_x_m=x_tip_le,
        taper_ratio=(tip_chord / root_chord) if root_chord > 1e-9 else 0.0,
        outline=outline, stations=stations,
    )


@dataclass
class Reconciliation:
    """How far the drawn shape is from the numbers the drag polar is written to."""
    drawn_area_m2: float
    reference_area_m2: float
    area_error: float           # signed fraction, (drawn - reference) / reference
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


CAD_SPAN_LENGTH = 0.73


def reconcile(af: AirframeSpec, pl: Planform | None = None) -> Reconciliation:
    pl = pl or build(af)
    ref_area = af.wing_area_m2
    area_err = (pl.area_m2 - ref_area) / ref_area if ref_area > 1e-9 else 0.0
    mac_err = (pl.mac_m - af.mac_m) / af.mac_m if af.mac_m > 1e-9 else 0.0
    sl = af.span_m / af.length_m if af.length_m > 1e-9 else 0.0
    sl_err = (sl - CAD_SPAN_LENGTH) / CAD_SPAN_LENGTH

    # L/D max under each reference, so the cost of the disagreement is explicit.
    def ld(area: float) -> float:
        ar = (af.span_m * af.span_m / area) if area > 1e-9 else 0.0
        k = 1.0 / (math.pi * ar * af.oswald_e) if ar > 1e-9 else 0.0
        d = k * af.cd0_sub
        return 0.5 / math.sqrt(d) if d > 1e-15 else 0.0

    tol = af.planform_area_tolerance
    warnings: List[str] = []
    if abs(area_err) > tol:
        warnings.append(
            f"Drawn planform encloses {pl.area_m2:.3f} m2; the drag polar is referenced to "
            f"{ref_area:.3f} m2, a {area_err * 100:+.0f}% disagreement. Aspect ratio is "
            f"{pl.aspect_ratio:.2f} on the drawn shape against {af.aspect_ratio:.2f} in the "
            f"spec, which moves L/D max from {ld(ref_area):.2f} to {ld(pl.area_m2):.2f}. "
            f"Every drag number on screen depends on which of the two is right.")
    if abs(mac_err) > tol:
        warnings.append(
            f"Drawn mean aerodynamic chord is {pl.mac_m:.3f} m against {af.mac_m:.3f} m in the "
            f"spec ({mac_err * 100:+.0f}%). Static margin is quoted in percent MAC, so the "
            f"balance readouts inherit this error.")
    if abs(sl_err) > 0.05:
        warnings.append(
            f"Span to length is {sl:.2f} against {CAD_SPAN_LENGTH:.2f} in the CAD plan view "
            f"({sl_err * 100:+.0f}%). The drawn planform is the right shape at the wrong "
            f"proportions.")

    return Reconciliation(
        drawn_area_m2=pl.area_m2, reference_area_m2=ref_area, area_error=area_err,
        drawn_aspect_ratio=pl.aspect_ratio, reference_aspect_ratio=af.aspect_ratio,
        drawn_mac_m=pl.mac_m, reference_mac_m=af.mac_m, mac_error=mac_err,
        span_length_ratio=sl, cad_span_length_ratio=CAD_SPAN_LENGTH,
        span_length_error=sl_err, tolerance=tol,
        consistent=not warnings,
        ld_max_reference=ld(ref_area), ld_max_drawn=ld(pl.area_m2),
        warnings=warnings,
    )
