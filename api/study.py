"""POST /api/study  -  airframe analysis.

The study page holds no aerodynamics of its own. Every number it draws comes
from here, which calls the same solver modules the console does, because a
second implementation of the drag polar drifts away from the first one and then
the two pages disagree about the same aircraft.

Body
    { ...MissionSpec, "op": "...", ...op arguments }

Operations
    polar        drag breakdown against Mach, the CL-CD polar, and L/D vs Mach
    sensitivity  perturb each parameter, re-solve, and rank by effect on range
    sweep        two parameters against a metric, with constraint flags per cell
    planform     outline, chord distribution and Schrenk span load
"""
from __future__ import annotations

import math
import os
import sys
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _core import study                                                  # noqa: E402
from _core.httputil import guarded, read_json, send                      # noqa: E402
from _core.planform import build as build_planform                       # noqa: E402
from _core.planform import validate_or_raise                              # noqa: E402
from _core.planform import reconcile                                     # noqa: E402
from _core.schema import MissionSpec, from_dict, to_dict                 # noqa: E402

MAX_SENSITIVITY_PARAMS = 12


def _run(handler: BaseHTTPRequestHandler, body: dict) -> None:
    op = str(body.pop("op", "polar"))
    args = body.pop("args", None) or {}
    spec = from_dict(MissionSpec, body)
    af = spec.airframe

    validate_or_raise(spec.airframe)
    if op == "polar":
        alt = float(args.get("altitude_m", spec.mission.cruise_altitude_m))
        mass = float(args.get("mass_kg", af.mass_dry_kg + 0.5 * af.fuel_capacity_kg))
        n = max(11, min(201, int(args.get("n", 101))))
        result = study.drag_breakdown(
            spec, alt, mass,
            float(args.get("m_lo", 0.1)), float(args.get("m_hi", 1.1)), n)
        send(handler, 200, {"ok": True, "op": op, "polar": to_dict(result)})
        return

    if op == "sensitivity":
        paths = args.get("paths") or study.DEFAULT_SENSITIVITY
        if len(paths) > MAX_SENSITIVITY_PARAMS:
            raise ValueError(
                f"{len(paths)} parameters requested; the ceiling is {MAX_SENSITIVITY_PARAMS}. "
                f"Each one costs two re-solves.")
        pert = float(args.get("perturbation", 0.10))
        if not 0.001 <= pert <= 0.5:
            raise ValueError("perturbation must be between 0.1% and 50%")
        send(handler, 200, {
            "ok": True, "op": op,
            "sensitivity": to_dict(study.sensitivity(spec, list(paths), pert)),
        })
        return

    if op == "sweep":
        need = ("x_path", "x_lo", "x_hi", "y_path", "y_lo", "y_hi")
        missing = [k for k in need if k not in args]
        if missing:
            raise ValueError(f"sweep needs {', '.join(missing)}")
        nx = int(args.get("nx", 20))
        ny = int(args.get("ny", 20))
        if nx * ny > study.MAX_GRID * study.MAX_GRID:
            raise ValueError(
                f"{nx} by {ny} is {nx * ny} cells; the ceiling is "
                f"{study.MAX_GRID * study.MAX_GRID}.")
        result = study.sweep(
            spec, str(args["x_path"]), float(args["x_lo"]), float(args["x_hi"]),
            str(args["y_path"]), float(args["y_lo"]), float(args["y_hi"]),
            str(args.get("metric", "range_km")), nx, ny)
        send(handler, 200, {"ok": True, "op": op, "sweep": to_dict(result)})
        return

    if op == "planform":
        pl = build_planform(af)
        send(handler, 200, {
            "ok": True, "op": op,
            "planform": to_dict(pl),
            "reconciliation": to_dict(reconcile(af, pl)),
        })
        return

    raise ValueError(f"unknown op '{op}'; expected polar, sensitivity, sweep or planform")


class handler(BaseHTTPRequestHandler):
    @guarded
    def do_POST(self):                                                   # noqa: N802
        _run(self, read_json(self))

    @guarded
    def do_GET(self):                                                    # noqa: N802
        _run(self, {})

    def log_message(self, *args):                                        # noqa: D102
        pass
