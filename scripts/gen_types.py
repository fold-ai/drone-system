#!/usr/bin/env python3
"""Generate lib/types.ts from the Python dataclasses.

The mission specification exists once, in api/_core/schema.py and engine.py.
This script reads those dataclasses - names, types, defaults, units and the
comment beside each field - and writes the TypeScript the browser compiles
against. Editing lib/types.ts by hand puts the two copies out of step, which is
exactly the failure this script exists to prevent.

    python scripts/gen_types.py            write lib/types.ts
    python scripts/gen_types.py --check    exit 1 if the file is out of date
"""
from __future__ import annotations

import ast
import dataclasses
import json
import os
import re
import sys
from typing import Any, Dict, List, Tuple

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "api"))

from _core import derived as derived_mod          # noqa: E402
from _core import encode as encode_mod            # noqa: E402
from _core import engine as engine_mod            # noqa: E402
from _core import planform as planform_mod       # noqa: E402
from _core import study as study_mod             # noqa: E402
from _core import schema as schema_mod            # noqa: E402
from _core.dynamics import COLUMNS                # noqa: E402
from _core import geometry_ratios as ratios_mod  # noqa: E402

OUT = os.path.join(ROOT, "lib", "types.ts")
OUT_PLANFORM = os.path.join(ROOT, "lib", "planform-measured.mjs")

EMIT = [
    (schema_mod, ["ScheduleNode", "PlanformSpec", "AirframeSpec", "AtmosphereSpec", "BoosterSpec",
                  "LaunchSpec", "MissionProfile", "ControlSpec", "IntegrationSpec",
                  "ResumeState", "MissionSpec", "FlightEvent", "ProfilePlan",
                  "ResolvedProfile", "FuelBudget", "LaunchFeasibility",
                  "MachSweepPoint", "Mach1Deficit", "TrajectorySummary",
                  "Trajectory", "SimulationResult"]),
    (engine_mod, ["EngineProfile"]),
    (derived_mod, ["Derived"]),
    (planform_mod, ["SpanStation", "Planform", "Reconciliation"]),
    (study_mod, ["DragPoint", "PolarPoint", "PolarResult", "Metrics", "SensitivityRow",
                 "Improvement", "SensitivityResult", "SweepAxis", "SweepResult"]),
]

SCALARS = {"float": "number", "int": "number", "bool": "boolean", "str": "string"}

UNITS: List[Tuple[str, str]] = [
    ("_km", "km"), ("_kgs", "kg/s"), ("_m2", "m2"), ("_ms", "m/s"), ("_ns", "N s"),
    ("_kg", "kg"), ("_deg", "deg"), ("_pa", "Pa"), ("_hz", "Hz"), ("_n", "N"),
    ("_s", "s"), ("_m", "m"), ("_k", "K"),
]


def unit_for(name: str) -> str:
    if name in ("mach", "target_mach", "mach_dd", "ram_mach_clamp", "max_mach",
                "max_level_mach"):
        return "M"
    if name.startswith("tsfc"):
        return "kg/(N h)"
    if name in ("dt",):
        return "s"
    for suffix, unit in UNITS:
        if name.endswith(suffix):
            return unit
    return ""


def ts_type(t: Any) -> str:
    """Map a dataclass annotation (a string, because of `from __future__ import
    annotations`) onto a TypeScript type."""
    s = str(t).strip().strip('"').strip("'")
    s = re.sub(r"^(typing\.|t\.)", "", s)
    if s.startswith("Optional[") and s.endswith("]"):
        return ts_type(s[9:-1]) + " | null"
    if s.startswith("List[") and s.endswith("]"):
        return ts_type(s[5:-1]) + "[]"
    if s.startswith("Dict[") and s.endswith("]"):
        k, v = _split_args(s[5:-1])
        return f"Record<{ts_type(k)}, {ts_type(v)}>"
    if s.startswith("Tuple[") or s == "tuple":
        return "number[]"
    return SCALARS.get(s, s)


def _split_args(s: str) -> Tuple[str, str]:
    depth = 0
    for i, ch in enumerate(s):
        if ch == "[":
            depth += 1
        elif ch == "]":
            depth -= 1
        elif ch == "," and depth == 0:
            return s[:i], s[i + 1:]
    return s, "Any"


def field_comments(module) -> Dict[str, Dict[str, str]]:
    """Pull the comment that documents each dataclass field: either the trailing
    `#` comment on its line, or a bare string literal on the following line."""
    src = open(module.__file__, encoding="utf-8").read()
    lines = src.splitlines()
    tree = ast.parse(src)
    out: Dict[str, Dict[str, str]] = {}
    for node in tree.body:
        if not isinstance(node, ast.ClassDef):
            continue
        per: Dict[str, str] = {}
        body = node.body
        for i, stmt in enumerate(body):
            if not isinstance(stmt, ast.AnnAssign) or not isinstance(stmt.target, ast.Name):
                continue
            name = stmt.target.id
            text = ""
            nxt = body[i + 1] if i + 1 < len(body) else None
            if (isinstance(nxt, ast.Expr) and isinstance(nxt.value, ast.Constant)
                    and isinstance(nxt.value.value, str)):
                text = " ".join(nxt.value.value.split())
            else:
                chunks = []
                for ln in range(stmt.end_lineno - 1, min(stmt.end_lineno + 3, len(lines))):
                    line = lines[ln]
                    hit = line.find("#")
                    if hit < 0:
                        break
                    if ln > stmt.end_lineno - 1 and line[:hit].strip():
                        break
                    chunks.append(line[hit + 1:].strip())
                text = " ".join(c for c in chunks if c)
            if text:
                per[name] = text
        if per:
            out[node.name] = per
    return out


def interface_for(cls, comments: Dict[str, str]) -> str:
    lines = [f"export interface {cls.__name__} {{"]
    doc = (cls.__doc__ or "").strip().splitlines()
    if doc:
        lines.insert(0, f"/** {doc[0].strip()} */")
    for f in dataclasses.fields(cls):
        c = comments.get(f.name, "")
        unit = unit_for(f.name)
        tag = f"  /** {c}{(' [' + unit + ']') if unit else ''} */\n" if (c or unit) else ""
        lines.append(f"{tag}  {f.name}: {ts_type(f.type)};")
    lines.append("}")
    return "\n".join(lines)


def meta_for(cls, comments: Dict[str, str], prefix: str) -> Dict[str, Any]:
    out = {}
    defaults = cls()
    for f in dataclasses.fields(cls):
        if f.type and ("Spec" in str(f.type) or "Profile" in str(f.type)
                       or "ScheduleNode" in str(f.type) or "ResumeState" in str(f.type)):
            continue
        path = f"{prefix}.{f.name}" if prefix else f.name
        entry: Dict[str, Any] = {
            "path": path,
            "label": f.name.replace("_", " "),
            "unit": unit_for(f.name),
            "type": ts_type(f.type),
            "default": schema_mod.to_dict(getattr(defaults, f.name)),
        }
        if comments.get(f.name):
            entry["doc"] = comments[f.name]
        rng = schema_mod.FIELD_RANGES.get(path)
        if rng:
            entry["min"], entry["max"], entry["step"] = rng
        out[path] = entry
    return out


def build() -> str:
    comments: Dict[str, Dict[str, str]] = {}
    for module, _ in EMIT:
        comments.update(field_comments(module))

    parts: List[str] = [
        "// GENERATED FILE - DO NOT EDIT.",
        "// Written by scripts/gen_types.py from api/_core/schema.py, engine.py and",
        "// derived.py. The mission specification is defined once, in Python. Run",
        "//     python scripts/gen_types.py",
        "// after changing any dataclass there.",
        "",
    ]
    for module, names in EMIT:
        for name in names:
            cls = getattr(module, name)
            parts.append(interface_for(cls, comments.get(name, {})))
            parts.append("")

    parts += [
        "/** Columns of the 50 Hz trajectory, in the order the solver packs them. */",
        "export const TRAJECTORY_COLUMNS = "
        + json.dumps(COLUMNS) + " as const;",
        "export type TrajectoryColumn = (typeof TRAJECTORY_COLUMNS)[number];",
        "",
        "/** Flight phase index -> name. */",
        "export const PHASE_NAMES = " + json.dumps(schema_mod.PHASE_NAMES) + " as const;",
        "",
        f'export const TRAJECTORY_FORMAT_F32 = "{encode_mod.FORMAT_F32}";',
        f'export const TRAJECTORY_FORMAT_F32_RAW = "{encode_mod.FORMAT_F32_RAW}";',
        f'export const TRAJECTORY_FORMAT_JSON = "{encode_mod.FORMAT_JSON}";',
        "",
        "/** Trajectory as it crosses the wire: the columns concatenated in",
        "  * `columns` order as little-endian float32, byte-plane shuffled,",
        "  * deflated and base64 encoded. `stride` is 1 unless the run was so long",
        "  * that it had to be decimated to fit the response limit. */",
        "export interface EncodedTrajectory {",
        "  format: string;",
        "  columns: TrajectoryColumn[];",
        "  n: number;",
        "  stride: number;",
        "  data: string | Record<string, number[]>;",
        "  note?: string;",
        "}",
        "",
        "export interface SimulationResponse extends Omit<SimulationResult, \"trajectory\"> {",
        "  ok: boolean;",
        "  trajectory: EncodedTrajectory;",
        "}",
        "",
        "export interface ApiError {",
        "  ok: false;",
        "  error: string;",
        "  detail?: string;",
        "}",
        "",
        "export interface FeasibilityResponse {",
        "  ok: boolean;",
        "  planform: Planform;",
        "  reconciliation: Reconciliation;",
        "  fuel: FuelBudget;",
        "  resolved: ResolvedProfile;",
        "  launch: LaunchFeasibility;",
        "  derived: Derived;",
        "  engine_only_exit_ms: number;",
        "  engine_only_feasible: boolean;",
        "  mach1: Mach1Deficit;",
        "  mach_sweep: MachSweepPoint[];",
        "  sweep_altitude_m: number;",
        "  sweep_mass_kg: number;",
        "  booster_solution?: LaunchFeasibility;",
        "  rail_trade?: RailTradePoint[];",
        "}",
        "",
        "export type StudyOp = \"polar\" | \"sensitivity\" | \"sweep\" | \"planform\";",
        "",
        "export interface StudyResponse {",
        "  ok: boolean;",
        "  op: StudyOp;",
        "  polar?: PolarResult;",
        "  sensitivity?: SensitivityResult;",
        "  sweep?: SweepResult;",
        "  planform?: Planform;",
        "  reconciliation?: Reconciliation;",
        "}",
        "",
        "/** Metrics a sweep can colour by. Keys match _core.study.METRICS. */",
        "export const SWEEP_METRICS = " + json.dumps(
            {k: {"label": v[0], "unit": v[1]} for k, v in study_mod.METRICS.items()}, indent=2)
        + " as const;",
        "",
        "/** Parameters a sweep or sensitivity run can address. */",
        "export const STUDY_PARAMS = " + json.dumps(
            {k: {"label": v[0], "unit": v[1]} for k, v in study_mod.PARAM_LABELS.items()},
            indent=2) + " as const;",
        "",
        "export const SWEEP_CONSTRAINTS = " + json.dumps(study_mod.CONSTRAINTS) + " as const;",
        "export const SWEEP_MAX_GRID = " + str(study_mod.MAX_GRID) + ";",
        "",
        "export interface RailTradePoint {",
        "  rail_length_m: number;",
        "  booster_thrust_n: number;",
        "  booster_burn_time_s: number;",
        "  booster_impulse_ns: number;",
        "  peak_g: number;",
        "  v_exit_ms: number;",
        "}",
        "",
        "/** Every default, straight from the Python dataclasses. */",
        "export const DEFAULT_MISSION_SPEC: MissionSpec = "
        + json.dumps(schema_mod.to_dict(schema_mod.MissionSpec()), indent=2) + ";",
        "",
        "export interface FieldMeta {",
        "  path: string;",
        "  label: string;",
        "  unit: string;",
        "  type: string;",
        "  default: number | boolean | string | null;",
        "  doc?: string;",
        "  min?: number;",
        "  max?: number;",
        "  step?: number;",
        "}",
        "",
        "/** Editable model constants: default, range and the note that documents",
        "  * where the number came from. Drives the Model parameters drawer. */",
        "export const FIELD_META: Record<string, FieldMeta> = ",
    ]
    meta: Dict[str, Any] = {}
    meta.update(meta_for(schema_mod.AirframeSpec, comments.get("AirframeSpec", {}), "airframe"))
    meta.update(meta_for(schema_mod.PlanformSpec, comments.get("PlanformSpec", {}), "airframe.planform"))
    meta.update(meta_for(engine_mod.EngineProfile, comments.get("EngineProfile", {}), "engine"))
    meta.update(meta_for(schema_mod.AtmosphereSpec, comments.get("AtmosphereSpec", {}), "atmosphere"))
    meta.update(meta_for(schema_mod.LaunchSpec, comments.get("LaunchSpec", {}), "launch"))
    meta.update(meta_for(schema_mod.BoosterSpec, comments.get("BoosterSpec", {}), "launch.booster"))
    meta.update(meta_for(schema_mod.MissionProfile, comments.get("MissionProfile", {}), "mission"))
    meta.update(meta_for(schema_mod.ControlSpec, comments.get("ControlSpec", {}), "control"))
    meta.update(meta_for(schema_mod.IntegrationSpec, comments.get("IntegrationSpec", {}), "integration"))
    parts.append(json.dumps(meta, indent=2) + ";")
    parts.append("")
    parts.append("export const MODEL_PARAM_GROUPS: { title: string; prefix: string }[] = [")
    parts.append('  { title: "Airframe", prefix: "airframe" },')
    parts.append('  { title: "Planform", prefix: "airframe.planform" },')
    parts.append('  { title: "Engine", prefix: "engine" },')
    parts.append('  { title: "Atmosphere", prefix: "atmosphere" },')
    parts.append('  { title: "Launch", prefix: "launch" },')
    parts.append('  { title: "Mission", prefix: "mission" },')
    parts.append('  { title: "Control", prefix: "control" },')
    parts.append('  { title: "Integration", prefix: "integration" },')
    parts.append("];")
    parts.append("")
    return "\n".join(parts)


def build_planform_module() -> str:
    """The measured tables, for the viewport.

    Generated rather than hand-copied so there is exactly one definition of the
    shape. The module recomputes the integrals in JavaScript and carries the
    Python results beside them, so the two implementations can be compared
    rather than assumed to agree.
    """
    half = ",\n  ".join(f"[{x}, {y}]" for x, y in ratios_mod.HALF_SPAN_BY_STATION)
    chord = ",\n  ".join(f"[{x}, {y}]" for x, y in ratios_mod.CHORD_BY_ETA)
    return f"""// GENERATED FILE - DO NOT EDIT.
// Written by scripts/gen_types.py from api/_core/geometry_ratios.py.
//
// The ACT-1 planform, measured from the plan-view CAD render. Nose at x/L = 0,
// every value a ratio of overall length: the render carries no dimensions, so
// the absolute scale is unknown and overall length is the one dimensional input.
//
// The integrals below are recomputed here in JavaScript rather than copied, and
// PYTHON carries what api/_core produced from the same tables. Two
// implementations that agree by construction are worth more than one that is
// trusted, and tests/test_physics.py asserts they do.

/** Half-span against station. Monotonic, so it inverts to give the leading edge. */
export const HALF_SPAN_BY_STATION = [
  {half},
];

/** Chord against span fraction. The render's outermost measurement is at 0.96. */
export const CHORD_BY_ETA = [
  {chord},
];

export const SWEEP_FOREBODY_DEG = {ratios_mod.SWEEP_FOREBODY_DEG};
export const SWEEP_INNER_DEG = {ratios_mod.SWEEP_INNER_DEG};
export const SWEEP_TIP_DEG = {ratios_mod.SWEEP_TIP_DEG};
export const CRANK_STATION = {ratios_mod.CRANK_STATION};
export const RADOME_STATION = {ratios_mod.RADOME_STATION};
export const INLET_START = {ratios_mod.INLET_START};
export const INLET_END = {ratios_mod.INLET_END};
export const ENGINE_START = {ratios_mod.ENGINE_START};
export const ENGINE_END = {ratios_mod.ENGINE_END};

/** Piecewise-linear with linear extrapolation off the ends. */
function interp(table, x) {{
  if (x <= table[0][0]) {{
    if (table.length < 2 || x === table[0][0]) return table[0][1];
    const [x0, y0] = table[0];
    const [x1, y1] = table[1];
    return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }}
  for (let i = 1; i < table.length; i += 1) {{
    const [x0, y0] = table[i - 1];
    const [x1, y1] = table[i];
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }}
  const [x0, y0] = table[table.length - 2];
  const [x1, y1] = table[table.length - 1];
  return y1 + ((y1 - y0) * (x - x1)) / (x1 - x0);
}}

/** Chord at span fraction eta, as a fraction of overall length. */
export function chordOverL(eta) {{
  return Math.max(0, interp(CHORD_BY_ETA, Math.min(1, Math.max(0, eta))));
}}

/** Leading-edge station at span fraction eta, inverting the half-span table. */
export function leStation(eta) {{
  const target = eta * (SPAN_OVER_L / 2);
  const t = HALF_SPAN_BY_STATION;
  if (target <= t[0][1]) return t[0][0];
  for (let i = 1; i < t.length; i += 1) {{
    const [x0, h0] = t[i - 1];
    const [x1, h1] = t[i];
    if (target <= h1) {{
      if (h1 - h0 < 1e-12) return x1;
      return x0 + ((x1 - x0) * (target - h0)) / (h1 - h0);
    }}
  }}
  return t[t.length - 1][0];
}}

/** Midpoint rule over eta from 0 to 1. The same rule api/_core uses. */
function integrate(f, n = {2000}) {{
  let total = 0;
  const step = 1 / n;
  for (let i = 0; i < n; i += 1) total += f((i + 0.5) * step);
  return total * step;
}}

export const SPAN_OVER_L = 2 * Math.max(...HALF_SPAN_BY_STATION.map((r) => r[1]));
export const CHORD_INTEGRAL = integrate(chordOverL);
export const CHORD_SQ_INTEGRAL = integrate((e) => chordOverL(e) ** 2);
export const AREA_OVER_L2 = SPAN_OVER_L * CHORD_INTEGRAL;
export const MAC_OVER_L = (SPAN_OVER_L / AREA_OVER_L2) * CHORD_SQ_INTEGRAL;
export const ASPECT_RATIO = (SPAN_OVER_L * SPAN_OVER_L) / AREA_OVER_L2;

/** What api/_core computed from the same tables, for the cross-check. */
export const PYTHON = {{
  SPAN_OVER_L: {ratios_mod.SPAN_OVER_L!r},
  AREA_OVER_L2: {ratios_mod.AREA_OVER_L2!r},
  MAC_OVER_L: {ratios_mod.MAC_OVER_L!r},
  ASPECT_RATIO: {ratios_mod.ASPECT_RATIO!r},
}};

/**
 * Overall length is the only dimensional input. Everything else is a measured
 * ratio of it, and none of it came from CAD dimensions.
 */
export function deriveGeometry(lengthM) {{
  const l = Math.max(1e-6, lengthM);
  return {{
    lengthM: l,
    spanM: SPAN_OVER_L * l,
    areaM2: AREA_OVER_L2 * l * l,
    macM: MAC_OVER_L * l,
    aspectRatio: ASPECT_RATIO,
  }};
}}
"""


def main() -> int:
    text = build()
    planform_text = build_planform_module()
    check = "--check" in sys.argv
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    outputs = [(OUT, text), (OUT_PLANFORM, planform_text)]
    if check:
        stale = [
            path for path, want in outputs
            if (open(path, encoding="utf-8").read() if os.path.exists(path) else None) != want
        ]
        if stale:
            names = ", ".join(os.path.relpath(p, ROOT) for p in stale)
            print(f"{names} out of date. Run: python scripts/gen_types.py")
            return 1
        print("lib/types.ts and lib/planform-measured.mjs are up to date.")
        return 0
    for path, want in outputs:
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(want)
    n = text.count("export interface")
    print(f"wrote {os.path.relpath(OUT, ROOT)}  ({len(text) / 1024:.1f} KB, "
          f"{n} interfaces, {len(COLUMNS)} trajectory columns)")
    print(f"wrote {os.path.relpath(OUT_PLANFORM, ROOT)}  "
          f"(b/L {ratios_mod.SPAN_OVER_L:.4f}, S/L2 {ratios_mod.AREA_OVER_L2:.4f}, "
          f"MAC/L {ratios_mod.MAC_OVER_L:.4f}, AR {ratios_mod.ASPECT_RATIO:.4f})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
