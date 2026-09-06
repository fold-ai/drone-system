"""POST /api/simulate  -  MissionSpec in, Trajectory out.

The solver is authoritative and batch. It integrates the whole flight and returns
every 50 Hz sample in one response; the browser plays that back against a clock.
There is no streaming and no JavaScript physics.

Query parameters
    format=f32 (default, shuffled and deflated) | f32raw | json | csv
    columns=a,b,c          restrict the trajectory to these columns
Body
    a MissionSpec object; every field is optional and falls back to its default.
    Include `resume` to splice a re-solve from a mid-flight state instead of
    replaying the rail launch.
"""
from __future__ import annotations

import os
import sys
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _core.dynamics import simulate                                      # noqa: E402
from _core.encode import encode_f32, encode_json, to_csv                 # noqa: E402
from _core.httputil import guarded, query, read_json, send               # noqa: E402
from _core.schema import MissionSpec, from_dict, to_dict                 # noqa: E402


def _run(handler: BaseHTTPRequestHandler, body: dict) -> None:
    q = query(handler)
    spec = from_dict(MissionSpec, body)
    cols = [c for c in q.get("columns", "").split(",") if c] or None
    result = simulate(spec)

    if q.get("format") == "csv":
        send(handler, 200, to_csv(result.trajectory, cols), "text/csv; charset=utf-8",
             filename=f"act1-{spec.label.lower().replace(' ', '-')}-trajectory.csv")
        return

    payload = to_dict(result)
    fmt = q.get("format")
    if fmt == "json":
        payload["trajectory"] = encode_json(result.trajectory, cols)
    else:
        payload["trajectory"] = encode_f32(result.trajectory, cols,
                                           compress=fmt != "f32raw")
    note = payload["trajectory"].get("note")
    if note:
        payload["warnings"] = list(payload.get("warnings") or []) + [note]
    payload["ok"] = True
    send(handler, 200, payload)


class handler(BaseHTTPRequestHandler):
    @guarded
    def do_POST(self):                                                   # noqa: N802
        _run(self, read_json(self))

    @guarded
    def do_GET(self):                                                    # noqa: N802
        """Smoke test: solve the default mission so a plain browser hit proves
        the runtime, the imports and the response size are all healthy."""
        _run(self, {})

    def log_message(self, *args):                                        # noqa: D102
        pass
