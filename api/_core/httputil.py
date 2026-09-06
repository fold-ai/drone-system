"""Small helpers shared by the Vercel handlers."""
from __future__ import annotations

import json
import traceback
from http.server import BaseHTTPRequestHandler
from typing import Any, Dict, Optional
from urllib.parse import parse_qs, urlparse

MAX_BODY = 4 * 1024 * 1024


def query(handler: BaseHTTPRequestHandler) -> Dict[str, str]:
    q = parse_qs(urlparse(handler.path).query)
    return {k: v[0] for k, v in q.items() if v}


def read_json(handler: BaseHTTPRequestHandler) -> Dict[str, Any]:
    length = int(handler.headers.get("content-length") or 0)
    if length <= 0:
        return {}
    if length > MAX_BODY:
        raise ValueError(f"request body of {length} bytes exceeds the {MAX_BODY} byte limit")
    raw = handler.rfile.read(length)
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"request body is not valid JSON: {exc}") from exc
    if not isinstance(parsed, dict):
        raise ValueError("request body must be a JSON object")
    return parsed


def send(handler: BaseHTTPRequestHandler, status: int, payload: Any,
         content_type: str = "application/json", filename: Optional[str] = None) -> None:
    body = payload if isinstance(payload, (bytes, bytearray)) else (
        payload.encode("utf-8") if isinstance(payload, str)
        else json.dumps(payload, allow_nan=False, separators=(",", ":")).encode("utf-8"))
    handler.send_response(status)
    handler.send_header("Content-Type", content_type)
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Cache-Control", "no-store")
    if filename:
        handler.send_header("Content-Disposition", f'attachment; filename="{filename}"')
    handler.end_headers()
    handler.wfile.write(body)


def send_error_json(handler: BaseHTTPRequestHandler, status: int, message: str,
                    detail: str = "") -> None:
    send(handler, status, {"ok": False, "error": message, "detail": detail})


def guarded(fn):
    """Turn an uncaught exception into a JSON error instead of a blank 500."""
    def wrapper(handler: BaseHTTPRequestHandler):
        try:
            fn(handler)
        except ValueError as exc:
            send_error_json(handler, 400, str(exc))
        except Exception as exc:                                     # noqa: BLE001
            send_error_json(handler, 500, f"{type(exc).__name__}: {exc}",
                            traceback.format_exc(limit=6))
    return wrapper
