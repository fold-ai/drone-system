"""POST /api/bench  -  measured data against the model.

The bench page holds no aerodynamics of its own. It sends a CSV and a column
mapping; this evaluates the same quantity from the same solver modules the
console uses and returns the residuals.

Body
    { ...MissionSpec,
      "op": "sniff" | "compare" | "quantities",
      "csv": "...",                 the file, as text
      "quantity": "thrust_n",
      "mapping": { "thrust_n": "Thrust (N)", "throttle": "PLA" },
      "scales":  { "thrust_n": 1.0 }        optional, overrides the unit hint
    }
"""
from __future__ import annotations

import os
import sys
from dataclasses import asdict
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _core import validate                                              # noqa: E402
from _core.httputil import guarded, read_json, send                     # noqa: E402
from _core.constants import SOLVER_VERSION                              # noqa: E402
from _core.planform import validate_or_raise                            # noqa: E402
from _core.schema import MissionSpec, from_dict, to_dict                # noqa: E402

MAX_CSV_BYTES = 8 * 1024 * 1024


def _run(handler: BaseHTTPRequestHandler, body: dict) -> None:
    op = str(body.pop("op", "compare"))
    csv_text = body.pop("csv", "") or ""
    quantity = str(body.pop("quantity", "") or "")
    mapping = body.pop("mapping", None) or {}
    scales = body.pop("scales", None) or {}

    if op == "quantities":
        send(handler, 200, {
            "ok": True, "op": op,
            "quantities": [asdict(q) for q in validate.QUANTITIES],
        })
        return

    if len(csv_text.encode("utf-8", "ignore")) > MAX_CSV_BYTES:
        raise ValueError(f"that file is larger than the {MAX_CSV_BYTES // (1024 * 1024)} MB ceiling")

    if op == "sniff":
        header = csv_text.splitlines()[0] if csv_text.strip() else ""
        if not header:
            raise ValueError("that file has no header row")
        import csv as _csv
        cols = next(_csv.reader([header]))
        send(handler, 200, {
            "ok": True, "op": op,
            **validate.sniff(cols),
            "quantities": [asdict(q) for q in validate.QUANTITIES],
            "preview": csv_text.splitlines()[:11],
        })
        return

    if op != "compare":
        raise ValueError(f"unknown op '{op}'; expected quantities, sniff or compare")

    spec = from_dict(MissionSpec, body)
    validate_or_raise(spec.airframe)
    result = validate.compare(spec, csv_text, quantity,
                              {k: str(v) for k, v in mapping.items() if v},
                              {k: float(v) for k, v in scales.items()})
    send(handler, 200, {
        "ok": True, "op": op,
        "comparison": to_dict(result, ndigits=8),
        "solver_version": SOLVER_VERSION,
    })


class handler(BaseHTTPRequestHandler):
    @guarded
    def do_POST(self):                                                  # noqa: N802
        _run(self, read_json(self))

    def log_message(self, *args):                                       # noqa: D102
        pass
