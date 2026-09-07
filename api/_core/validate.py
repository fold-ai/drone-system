"""Measured data against the model.

A simulator that is never compared with a measurement is a drawing. This module
takes rows of bench, tunnel or flight data, evaluates the same quantity from the
model at the same conditions, and returns the residuals.

It computes nothing new. Every prediction comes from the modules the console and
the solver already use, so a residual here is a real statement about the model
rather than about a second implementation of it.

What a quantity needs is declared rather than assumed. The interface reads
QUANTITIES to build its column mapping, so adding one here is the only step
needed to make it importable.
"""
from __future__ import annotations

import csv
import io
import math
from dataclasses import dataclass, field
from typing import Callable, Dict, List, Optional, Sequence, Tuple

from .aero import evaluate as aero_evaluate
from .aero import cd0_of_mach, stall_speed
from .atmosphere import isa
from .constants import G0
from .engine import EngineProfile
from .schema import MissionSpec

MAX_ROWS = 20000


@dataclass
class Condition:
    """One input a quantity needs, and where it may come from."""
    key: str
    label: str
    unit: str
    required: bool = True
    default: Optional[float] = None
    aliases: Tuple[str, ...] = ()


@dataclass
class Quantity:
    key: str
    label: str
    unit: str
    kind: str                      # engine | wind_tunnel | flight
    conditions: Tuple[Condition, ...]
    aliases: Tuple[str, ...] = ()
    note: str = ""


def _c(key, label, unit, required=True, default=None, aliases=()):
    return Condition(key, label, unit, required, default, aliases)


QUANTITIES: Tuple[Quantity, ...] = (
    Quantity(
        "thrust_n", "Net thrust", "N", "engine",
        (_c("throttle", "Throttle", "0-1", aliases=("throttle", "pla", "cmd", "power")),
         _c("altitude_m", "Altitude", "m", False, 0.0, ("altitude", "alt", "h_m", "height")),
         _c("mach", "Mach", "M", False, 0.0, ("mach", "m"))),
        aliases=("thrust", "force", "fn", "net_thrust"),
        note="Static stand data is altitude 0 and Mach 0, which is the default.",
    ),
    Quantity(
        "fuel_flow_kgs", "Fuel flow", "kg/s", "engine",
        (_c("throttle", "Throttle", "0-1", aliases=("throttle", "pla", "cmd", "power")),
         _c("altitude_m", "Altitude", "m", False, 0.0, ("altitude", "alt", "h_m")),
         _c("mach", "Mach", "M", False, 0.0, ("mach",))),
        aliases=("fuel_flow", "fuelflow", "ff", "mdot_f", "wf"),
        note="Compared at the thrust the model produces for that throttle, not "
             "at the measured thrust, so a thrust error shows up here too.",
    ),
    Quantity(
        "cd", "Drag coefficient", "", "wind_tunnel",
        (_c("cl", "Lift coefficient", "", aliases=("cl", "c_l", "lift_coefficient")),
         _c("mach", "Mach", "M", False, 0.0, ("mach", "m"))),
        aliases=("cd", "c_d", "drag_coefficient"),
        note="Against the fitted polar CD = CD0(M) + k CL^2.",
    ),
    Quantity(
        "cd0", "Zero-lift drag coefficient", "", "wind_tunnel",
        (_c("mach", "Mach", "M", aliases=("mach", "m")),),
        aliases=("cd0", "cd_0", "cdmin", "cd_min"),
    ),
    Quantity(
        "ld", "Lift to drag ratio", "", "wind_tunnel",
        (_c("cl", "Lift coefficient", "", aliases=("cl", "c_l")),
         _c("mach", "Mach", "M", False, 0.0, ("mach",))),
        aliases=("ld", "l_d", "l/d", "lift_to_drag"),
    ),
    Quantity(
        "stall_speed_ms", "Stall speed", "m/s", "flight",
        (_c("mass_kg", "Mass", "kg", aliases=("mass", "weight", "gross_mass")),
         _c("altitude_m", "Altitude", "m", False, 0.0, ("altitude", "alt", "h_m")),
         _c("load_factor", "Load factor", "g", False, 1.0, ("load_factor", "n_z", "nz", "g"))),
        aliases=("stall_speed", "v_stall", "vs", "stall"),
    ),
)

QUANTITIES_BY_KEY = {q.key: q for q in QUANTITIES}


# --------------------------------------------------------------------------
# Model evaluation
# --------------------------------------------------------------------------

def _model(spec: MissionSpec, quantity: str, cond: Dict[str, float]) -> float:
    af = spec.airframe
    eng = spec.engine
    if quantity == "thrust_n":
        atmo = isa(cond["altitude_m"], spec.atmosphere.delta_isa_k)
        v = cond["mach"] * atmo.a_ms
        return eng.net_thrust(atmo.rho, cond["mach"], v, cond["throttle"])
    if quantity == "fuel_flow_kgs":
        atmo = isa(cond["altitude_m"], spec.atmosphere.delta_isa_k)
        v = cond["mach"] * atmo.a_ms
        thrust = eng.net_thrust(atmo.rho, cond["mach"], v, cond["throttle"])
        return eng.fuel_flow(thrust, cond["throttle"])
    if quantity == "cd0":
        return cd0_of_mach(af, cond["mach"])
    if quantity in ("cd", "ld"):
        cl = cond["cl"]
        cd = cd0_of_mach(af, cond["mach"]) + af.k_induced * cl * cl
        return cd if quantity == "cd" else (cl / cd if cd > 0 else 0.0)
    if quantity == "stall_speed_ms":
        atmo = isa(cond["altitude_m"], spec.atmosphere.delta_isa_k)
        return stall_speed(af, atmo.rho, cond["mass_kg"], G0, cond["load_factor"])
    raise ValueError(f"unknown quantity '{quantity}'")


# --------------------------------------------------------------------------
# CSV
# --------------------------------------------------------------------------

@dataclass
class ColumnSuggestion:
    column: str
    role: str          # the quantity key, a condition key, or ""
    confidence: str    # exact | prefix | none


def sniff(header: Sequence[str]) -> Dict[str, object]:
    """Guess what each column is, so the operator corrects a mapping rather than
    building one from nothing. A guess is offered, never applied silently."""
    out: List[ColumnSuggestion] = []
    lowered = [(h, h.strip().lower()) for h in header]
    for original, low in lowered:
        role, confidence = "", "none"
        stripped = low.replace(" ", "_")
        for q in QUANTITIES:
            names = (q.key,) + q.aliases
            if stripped in names:
                role, confidence = q.key, "exact"
                break
            if any(stripped.startswith(n) for n in names):
                role, confidence = q.key, "prefix"
        if not role:
            for q in QUANTITIES:
                for c in q.conditions:
                    names = (c.key,) + c.aliases
                    if stripped in names:
                        role, confidence = c.key, "exact"
                        break
                    if any(stripped.startswith(n) for n in names) and confidence == "none":
                        role, confidence = c.key, "prefix"
                if confidence == "exact":
                    break
        out.append(ColumnSuggestion(original, role, confidence))
    return {"columns": [vars(s) for s in out]}


# Unit hints written into a column name. Bench sheets carry them far more often
# than they carry a units row, and reading kg/h as kg/s is a factor of 3600.
_SCALES: Tuple[Tuple[Tuple[str, ...], float], ...] = (
    (("_kgh", "kg_h", "kg/h", "_kph"), 1.0 / 3600.0),
    (("_gs", "g_s", "g/s"), 1.0 / 1000.0),
    (("_kn", "_kilonewton"), 1000.0),
    (("_lbf",), 4.4482216152605),
    (("_ft", "_feet"), 0.3048),
    (("_kt", "_knots", "_kts"), 0.5144444444),
    (("_kmh", "km_h", "km/h"), 1.0 / 3.6),
    (("_pct", "_percent", "_%"), 0.01),
)


def unit_scale(column: str) -> float:
    low = column.strip().lower().replace(" ", "_")
    for suffixes, scale in _SCALES:
        if any(low.endswith(s) or s in low for s in suffixes):
            return scale
    return 1.0


@dataclass
class Residual:
    row: int
    condition: Dict[str, float]
    measured: float
    model: float
    residual: float
    residual_pct: float


@dataclass
class Comparison:
    quantity: str
    label: str
    unit: str
    kind: str
    n: int
    rows: List[Residual] = field(default_factory=list)
    bias: float = 0.0
    rms: float = 0.0
    max_abs: float = 0.0
    bias_pct: float = 0.0
    rms_pct: float = 0.0
    r2: float = 0.0
    skipped: List[str] = field(default_factory=list)
    note: str = ""


def compare(spec: MissionSpec, csv_text: str, quantity: str,
            mapping: Dict[str, str],
            scales: Optional[Dict[str, float]] = None) -> Comparison:
    """Residuals for one quantity across every row of a CSV.

    `mapping` sends a role - the quantity key or one of its condition keys - to
    a column name. Anything the mapping does not cover falls back to the
    condition's declared default, and a condition with no default and no column
    is an error rather than a guess.
    """
    q = QUANTITIES_BY_KEY.get(quantity)
    if q is None:
        raise ValueError(f"unknown quantity '{quantity}'; expected one of "
                         f"{', '.join(QUANTITIES_BY_KEY)}")
    scales = scales or {}
    rows = list(csv.DictReader(io.StringIO(csv_text)))
    if not rows:
        raise ValueError("that CSV has a header and no data rows")
    if len(rows) > MAX_ROWS:
        raise ValueError(f"{len(rows)} rows; the ceiling is {MAX_ROWS}")

    measured_col = mapping.get(quantity)
    if not measured_col:
        raise ValueError(f"no column mapped to {q.label}")

    missing = [c.label for c in q.conditions
               if c.required and not mapping.get(c.key) and c.default is None]
    if missing:
        raise ValueError(f"{q.label} needs a column for {', '.join(missing)}")

    out: List[Residual] = []
    skipped: List[str] = []
    for i, raw in enumerate(rows):
        try:
            measured = float(raw[measured_col]) * scales.get(
                quantity, unit_scale(measured_col))
        except (KeyError, TypeError, ValueError):
            skipped.append(f"row {i + 1}: {q.label} is not a number")
            continue

        cond: Dict[str, float] = {}
        bad = None
        for c in q.conditions:
            col = mapping.get(c.key)
            if col:
                try:
                    cond[c.key] = float(raw[col]) * scales.get(c.key, unit_scale(col))
                except (KeyError, TypeError, ValueError):
                    bad = f"row {i + 1}: {c.label} is not a number"
                    break
            elif c.default is not None:
                cond[c.key] = c.default
            else:
                bad = f"row {i + 1}: no value for {c.label}"
                break
        if bad:
            skipped.append(bad)
            continue

        # Throttle given as a percentage is the commonest sheet convention.
        if "throttle" in cond and cond["throttle"] > 1.5:
            cond["throttle"] /= 100.0

        model = _model(spec, quantity, cond)
        if not math.isfinite(model) or not math.isfinite(measured):
            skipped.append(f"row {i + 1}: non-finite value")
            continue
        residual = model - measured
        out.append(Residual(
            row=i + 1, condition=dict(cond), measured=measured, model=model,
            residual=residual,
            residual_pct=(residual / abs(measured) * 100.0) if measured else 0.0,
        ))

    result = Comparison(quantity=q.key, label=q.label, unit=q.unit, kind=q.kind,
                        n=len(out), rows=out, skipped=skipped[:50], note=q.note)
    if out:
        res = [r.residual for r in out]
        meas = [r.measured for r in out]
        result.bias = sum(res) / len(res)
        result.rms = math.sqrt(sum(r * r for r in res) / len(res))
        result.max_abs = max(abs(r) for r in res)
        scale = sum(abs(m) for m in meas) / len(meas)
        if scale > 0:
            result.bias_pct = result.bias / scale * 100.0
            result.rms_pct = result.rms / scale * 100.0
        mean = sum(meas) / len(meas)
        ss_tot = sum((m - mean) ** 2 for m in meas)
        ss_res = sum(r * r for r in res)
        # Against the measurements, so it says how much of the spread the model
        # explains. Negative means the mean of the data would fit better.
        result.r2 = 1.0 - ss_res / ss_tot if ss_tot > 0 else 0.0
    return result
