"""POST /api/optimise  -  advance a design search by one batch.

Search is a job, not a request. A few thousand evaluations take longer than any
serverless function may run, so this endpoint is a step function: it takes the
search state in, spends a bounded amount of wall time on real solver calls, and
returns the new state along with every evaluation it performed.

Nothing is persisted here. The caller writes the state and the evaluations to
Postgres, which keeps database access in one place and keeps this function
stateless and safe to retry.

Body
    {
      "op": "init" | "step" | "best",
      "base": { ...MissionSpec },
      "keys": ["length_m", "aspect_ratio", ...],
      "objective": "range_km",
      "weights": { "range_km": 0.7, "endurance_s": 0.3 },   optional
      "constraints": { ...ConstraintSpec },                 optional
      "state": { ... },        required for step
      "budget": 200,           evaluations, capped
      "deadline_s": 40         wall clock, capped
    }
"""
from __future__ import annotations

import os
import sys
from dataclasses import asdict
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _core import optimise as search                                     # noqa: E402
from _core.httputil import guarded, read_json, send                      # noqa: E402
from _core.schema import MissionSpec, from_dict, to_dict                 # noqa: E402

MAX_BUDGET = 400
MAX_DEADLINE_S = 45.0
MAX_POPULATION = 64


def _run(handler: BaseHTTPRequestHandler, body: dict) -> None:
    op = str(body.get("op", "step"))
    base = from_dict(MissionSpec, body.get("base") or {})
    keys = [k for k in (body.get("keys") or [v.key for v in search.DESIGN_VARIABLES])
            if k in search.VARIABLES_BY_KEY]
    if not keys:
        raise ValueError("no recognised design variables")

    if op == "init":
        population = max(8, min(MAX_POPULATION, int(body.get("population", 24))))
        state = search.init_state(keys, population=population, seed=int(body.get("seed", 0)))
        send(handler, 200, {
            "ok": True, "op": op,
            "state": search.state_to_json(state),
            "variables": [asdict(v) for v in search.DESIGN_VARIABLES if v.key in keys],
            "search_version": search.SEARCH_VERSION,
        })
        return

    if op not in ("step", "best"):
        raise ValueError(f"unknown op '{op}'; expected init, step or best")

    raw_state = body.get("state")
    if not raw_state:
        raise ValueError(f"{op} requires the state returned by init or a previous step")
    state = search.state_from_json(raw_state)

    cons = search.ConstraintSpec(**{
        k: float(v) for k, v in (body.get("constraints") or {}).items()
        if k in search.ConstraintSpec.__dataclass_fields__
    })
    weights = body.get("weights") or None
    objective = str(body.get("objective", "range_km"))
    if op == "best":
        # Re-read the winner from a stored state without advancing the search.
        # Used when writing up a finished run: the spec has to be rebuilt from
        # the vector, and rebuilding it here keeps that arithmetic in one place.
        best = search.best_vector(state)
        if not best:
            raise ValueError("the search has not evaluated anything yet")
        best_eval = search.evaluate(base, best, objective, weights, cons)
        send(handler, 200, {
            "ok": True, "op": op,
            "values": best,
            "evaluation": asdict(best_eval),
            "spec": to_dict(search.apply_vector(base, best), ndigits=6),
            "variables": [asdict(v) for v in search.DESIGN_VARIABLES if v.key in keys],
            "generation": state.generation,
            "search_version": search.SEARCH_VERSION,
        })
        return

    budget = max(1, min(MAX_BUDGET, int(body.get("budget", 200))))
    deadline = max(1.0, min(MAX_DEADLINE_S, float(body.get("deadline_s", 40.0))))

    state, evaluations = search.step(state, base, objective, weights, cons, budget, deadline)

    best = search.best_vector(state)
    best_eval = search.evaluate(base, best, objective, weights, cons) if best else None
    send(handler, 200, {
        "ok": True, "op": op,
        "state": search.state_to_json(state),
        "evaluations": [asdict(e) for e in evaluations],
        "best": {
            "values": best,
            "evaluation": asdict(best_eval) if best_eval else None,
            "spec": to_dict(search.apply_vector(base, best), ndigits=6) if best else None,
        },
        "search_version": search.SEARCH_VERSION,
    })


class handler(BaseHTTPRequestHandler):
    @guarded
    def do_POST(self):                                                   # noqa: N802
        _run(self, read_json(self))

    def log_message(self, *args):                                        # noqa: D102
        pass
