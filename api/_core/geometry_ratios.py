"""ACT-1 measured geometry: the tables and everything derived from them.

This module is the single definition of the shape and has no imports, so both
the specification and the planform builder can use it without a cycle. The
viewport lofts from the same numbers, generated into lib/planform-measured.mjs
by scripts/gen_types.py.

Everything is a ratio of overall length. The render carries no dimensions, so
the absolute scale is unknown: `length_m` is the one dimensional input and every
other dimension follows from it. Nothing derived here should ever be presented
as if it came from CAD.

Two measured tables define the planform:

    half-span against station, which fixes the leading edge
    chord against span fraction, which fixes the trailing edge from it

Reference area and mean aerodynamic chord are integrals of those tables, so they
cannot drift away from the drawn shape:

    S    = b * integral of c(eta) d eta
    MAC  = (b / S) * integral of c(eta)^2 d eta

which give S/L^2 = 0.368, AR = 1.42 and MAC = 0.598 L. The span load is a
Schrenk approximation and is labelled as such wherever it is shown.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import List, Sequence, Tuple

# --------------------------------------------------------------------------
# The measurements. Nose at x/L = 0, all values normalised to overall length.
# --------------------------------------------------------------------------

#: Half-span against station. Monotonic, so it inverts to give the leading edge.
HALF_SPAN_BY_STATION: Tuple[Tuple[float, float], ...] = (
    (0.00, 0.000),
    (0.05, 0.045),
    (0.10, 0.059),
    (0.20, 0.080),
    (0.30, 0.099),
    (0.40, 0.127),
    (0.50, 0.179),
    (0.60, 0.243),
    (0.70, 0.306),
    (0.75, 0.337),
    (0.80, 0.351),
    (0.90, 0.360),
    (0.95, 0.361),
)

#: Chord against span fraction. The value at eta = 1 is extrapolated from the
#: last two measured points; the render's outermost measurement is at 0.96.
CHORD_BY_ETA: Tuple[Tuple[float, float], ...] = (
    (0.00, 0.827),
    (0.20, 0.795),
    (0.40, 0.518),
    (0.60, 0.405),
    (0.80, 0.309),
    (0.96, 0.232),
)

#: Leading-edge sweep angles read off the render, for reference and for the
#: viewport's chine treatment. The outline itself comes from the tables.
SWEEP_FOREBODY_DEG = 77.4
SWEEP_INNER_DEG = 59.0
SWEEP_TIP_DEG = 84.8
CRANK_STATION = 0.78
RADOME_STATION = 0.24

#: Centreline features, as stations along the length.
INLET_START = 0.28
INLET_END = 0.45
ENGINE_START = 0.45
ENGINE_END = 0.60

SPAN_OVER_L = 2.0 * max(v for _, v in HALF_SPAN_BY_STATION)

#: Tolerance on a supplied span or area before the solve refuses to run.
GEOMETRY_TOLERANCE = 0.02


def _interp(table: Sequence[Tuple[float, float]], x: float) -> float:
    """Piecewise-linear with linear extrapolation off the ends."""
    if x <= table[0][0]:
        if len(table) < 2 or x == table[0][0]:
            return table[0][1]
        (x0, y0), (x1, y1) = table[0], table[1]
        return y0 + (y1 - y0) * (x - x0) / (x1 - x0)
    for i in range(1, len(table)):
        x0, y0 = table[i - 1]
        x1, y1 = table[i]
        if x <= x1:
            return y0 + (y1 - y0) * (x - x0) / (x1 - x0)
    (x0, y0), (x1, y1) = table[-2], table[-1]
    return y1 + (y1 - y0) * (x - x1) / (x1 - x0)


def chord_over_l(eta: float) -> float:
    """Chord at span fraction eta, as a fraction of overall length."""
    return max(0.0, _interp(CHORD_BY_ETA, min(1.0, max(0.0, eta))))


def le_station(eta: float) -> float:
    """Leading-edge station at span fraction eta.

    The half-span table is measured the other way round - width at a station -
    so it is inverted here. It is monotonic, so the inverse is single valued.
    """
    target = eta * (SPAN_OVER_L / 2.0)
    table = HALF_SPAN_BY_STATION
    if target <= table[0][1]:
        return table[0][0]
    for i in range(1, len(table)):
        x0, h0 = table[i - 1]
        x1, h1 = table[i]
        if target <= h1:
            if h1 - h0 < 1e-12:
                return x1
            return x0 + (x1 - x0) * (target - h0) / (h1 - h0)
    return table[-1][0]


def _integrate(f, n: int = 2000) -> float:
    """Midpoint rule over eta from 0 to 1. Both implementations use this one."""
    total = 0.0
    step = 1.0 / n
    for i in range(n):
        total += f((i + 0.5) * step)
    return total * step


def _mac_le_station() -> float:
    """Leading-edge station of the mean aerodynamic chord.

    x_LE_MAC = (b / S) * integral of c(eta) * x_le(eta) d eta, which is where the
    quarter-chord datum is measured from.
    """
    num = _integrate(lambda e: chord_over_l(e) * le_station(e))
    return (SPAN_OVER_L / (SPAN_OVER_L * _integrate(chord_over_l))) * num


#: Integrals of the chord table, in units of L and L^2. Computed once.
CHORD_INTEGRAL = _integrate(chord_over_l)
CHORD_SQ_INTEGRAL = _integrate(lambda e: chord_over_l(e) ** 2)
AREA_OVER_L2 = SPAN_OVER_L * CHORD_INTEGRAL
MAC_OVER_L = (SPAN_OVER_L / AREA_OVER_L2) * CHORD_SQ_INTEGRAL if AREA_OVER_L2 > 0 else 0.0
ASPECT_RATIO = (SPAN_OVER_L * SPAN_OVER_L / AREA_OVER_L2) if AREA_OVER_L2 > 0 else 0.0
MAC_LE_OVER_L = _mac_le_station()

#: Neutral point, estimated as the quarter chord of the mean aerodynamic chord.
#: A first-order estimate for a tailless planform, not a measurement, and the
#: balance readouts inherit that.
NEUTRAL_POINT_OVER_L = MAC_LE_OVER_L + 0.25 * MAC_OVER_L


@dataclass
class DerivedGeometry:
    """Every dimension the drag polar needs, from one length."""
    length_m: float
    span_m: float
    area_m2: float
    mac_m: float
    aspect_ratio: float
    span_over_l: float
    area_over_l2: float
    mac_over_l: float


def derive(length_m: float, span_stretch: float = 1.0) -> DerivedGeometry:
    """Overall length is the only dimensional input. Everything else is measured.

    `span_stretch` re-lofts the planform at a different aspect ratio: span times
    the stretch, every chord divided by it. Reference area is unchanged, mean
    chord scales inversely, and aspect ratio goes as the square. At 1.0 the
    shape is exactly as measured, which is the only value that came from CAD.
    """
    l = max(1e-6, length_m)
    k = max(1e-6, span_stretch)
    return DerivedGeometry(
        length_m=l,
        span_m=SPAN_OVER_L * l * k,
        area_m2=AREA_OVER_L2 * l * l,
        mac_m=MAC_OVER_L * l / k,
        aspect_ratio=ASPECT_RATIO * k * k,
        span_over_l=SPAN_OVER_L * k,
        area_over_l2=AREA_OVER_L2,
        mac_over_l=MAC_OVER_L / k,
    )
