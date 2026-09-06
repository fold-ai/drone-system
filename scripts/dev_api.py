#!/usr/bin/env python3
"""Local stand-in for the Vercel Python runtime.

Serves the same two routes from the same handler modules, so `next dev` sees the
production URL shape. Nothing in api/ is aware this file exists.

    python scripts/dev_api.py [--port 8787]
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "api"))

import feasibility as feasibility_route          # noqa: E402
import simulate as simulate_route                # noqa: E402
from _core.httputil import read_json, send, send_error_json   # noqa: E402

ROUTES = {"/api/simulate": simulate_route, "/api/feasibility": feasibility_route}


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _dispatch(self, body: dict) -> None:
        path = urlparse(self.path).path
        route = ROUTES.get(path)
        if route is None:
            send_error_json(self, 404, f"no route for {path}",
                            "available: " + ", ".join(sorted(ROUTES)))
            return
        t0 = time.perf_counter()
        route._run(self, body)
        ms = (time.perf_counter() - t0) * 1000
        print(f"  {path}  {ms:7.0f} ms", flush=True)

    def do_POST(self):                                       # noqa: N802
        try:
            self._dispatch(read_json(self))
        except ValueError as exc:
            send_error_json(self, 400, str(exc))
        except Exception as exc:                             # noqa: BLE001
            traceback.print_exc()
            send_error_json(self, 500, f"{type(exc).__name__}: {exc}",
                            traceback.format_exc(limit=8))

    def do_GET(self):                                        # noqa: N802
        if urlparse(self.path).path == "/api/health":
            send(self, 200, {"ok": True, "python": sys.version.split()[0]})
            return
        try:
            self._dispatch({})
        except Exception as exc:                             # noqa: BLE001
            traceback.print_exc()
            send_error_json(self, 500, f"{type(exc).__name__}: {exc}")

    def do_OPTIONS(self):                                    # noqa: N802
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "content-type")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def log_message(self, *args):                            # noqa: D102
        pass


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=int(os.environ.get("ACT1_API_PORT", 8787)))
    args = ap.parse_args()
    srv = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"ACT-1 solver on http://127.0.0.1:{args.port}  "
          f"(python {sys.version.split()[0]})", flush=True)
    print(f"  routes: {', '.join(sorted(ROUTES))}", flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
