"""POST /api/feasibility  -  launch, booster sizing and performance envelope.

Everything here is closed-form or a short quadrature, so it answers in tens of
milliseconds. The mission configuration panel calls it while a slider is moving;
the full trajectory solve only runs when the operator presses RUN.

Body
    { ...MissionSpec, "options": { "solve_booster": true, "rail_trade": true,
                                   "rail_lengths": [2, 3, 5], "sweep_altitude_m": 3000,
                                   "sweep_mass_kg": 13.5, "target_margin": 1.15 } }
"""
from __future__ import annotations

import math
import os
import sys
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _core.derived import derive                                         # noqa: E402
from _core.httputil import guarded, read_json, send                      # noqa: E402
from _core.launch import feasibility, rail_length_trade, run_rail, solve_booster  # noqa: E402
from _core.mission import resolve_profile, size_mission                  # noqa: E402
from _core.performance import mach1_deficit, mach_sweep                  # noqa: E402
from _core.schema import MissionSpec, from_dict, to_dict                 # noqa: E402


def _run(handler: BaseHTTPRequestHandler, body: dict) -> None:
    opts = body.pop("options", None) or {}
    spec = from_dict(MissionSpec, body)
    h_exit = (spec.atmosphere.ground_altitude_m
              + spec.launch.rail_length_m * math.sin(math.radians(spec.launch.rail_angle_deg)))

    budget, plan = size_mission(spec, h_exit)
    resolved = resolve_profile(spec, plan)
    fuel = budget.fuel_loaded_kg
    lf = feasibility(spec, fuel)
    bare = run_rail(spec, fuel, booster_thrust_override=0.0, booster_burn_override=0.0)

    mass = spec.airframe.mass_dry_kg + 0.5 * fuel
    alt = float(opts.get("sweep_altitude_m", spec.mission.cruise_altitude_m))
    sweep_mass = float(opts.get("sweep_mass_kg", mass))
    d_isa = spec.atmosphere.delta_isa_k

    payload = {
        "ok": True,
        "fuel": to_dict(budget),
        "resolved": to_dict(resolved),
        "launch": to_dict(lf),
        "derived": to_dict(derive(spec, fuel)),
        "engine_only_exit_ms": bare.v_exit,
        "engine_only_feasible": bare.v_exit >= lf.v_required_ms,
        "mach1": to_dict(mach1_deficit(spec.airframe, spec.engine, alt, sweep_mass, d_isa)),
        "mach_sweep": to_dict(mach_sweep(spec.airframe, spec.engine, alt, sweep_mass, d_isa)),
        "sweep_altitude_m": alt,
        "sweep_mass_kg": sweep_mass,
    }
    if opts.get("solve_booster"):
        payload["booster_solution"] = to_dict(
            solve_booster(spec, fuel, target_margin=opts.get("target_margin")))
    if opts.get("rail_trade"):
        payload["rail_trade"] = rail_length_trade(spec, fuel, opts.get("rail_lengths"))
    send(handler, 200, payload)


class handler(BaseHTTPRequestHandler):
    @guarded
    def do_POST(self):                                                   # noqa: N802
        _run(self, read_json(self))

    @guarded
    def do_GET(self):                                                    # noqa: N802
        _run(self, {"options": {"solve_booster": True, "rail_trade": True}})

    def log_message(self, *args):                                        # noqa: D102
        pass
