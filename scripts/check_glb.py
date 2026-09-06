#!/usr/bin/env python3
"""Validate an exported airframe mesh against the contract.

    python scripts/check_glb.py public/models/act1.glb

Checks what the viewport actually depends on: that the file is glTF 2.0 binary,
that normals are present, that it is small enough to ship, and which of the
contract part names it carries. Reports rather than rejects: an unnamed single
mesh is legal and loads, it just colours as one surface.
"""
from __future__ import annotations

import json
import os
import struct
import sys

CONTRACT_PARTS = [
    "radome", "body", "wing_L", "wing_R", "tip_L", "tip_R",
    "inlet", "engine", "spike", "nozzle", "fin_L", "fin_R",
]
PATTERNS = [
    ("radome", ("radome", "nose", "nosecone")),
    ("spike", ("spike", "centrebody", "centerbody")),
    ("nozzle", ("nozzle", "exhaust")),
    ("inlet", ("inlet", "intake", "duct")),
    ("engine", ("engine", "casing", "nacelle")),
    ("control", ("tip_l", "tip_r", "elevon", "flap", "aileron")),
    ("fin", ("fin_l", "fin_r", "blade", "strake")),
    ("wing", ("wing",)),
    ("body", ("body", "fuselage", "centre", "center")),
]
MAX_BYTES = 4 * 1024 * 1024


def resolve(name: str) -> str:
    low = name.lower()
    for part, keys in PATTERNS:
        if any(k in low for k in keys):
            return part
    return "body"


def read_glb(path: str) -> dict:
    with open(path, "rb") as fh:
        data = fh.read()
    if len(data) < 12 or data[:4] != b"glTF":
        raise SystemExit(f"{path}: not a GLB (missing the glTF magic)")
    version, total = struct.unpack_from("<II", data, 4)
    if version != 2:
        raise SystemExit(f"{path}: glTF version {version}, the contract is 2.0")
    if total != len(data):
        print(f"  warning: header length {total} but the file is {len(data)} bytes")
    offset = 12
    js = None
    while offset < len(data):
        clen, ctype = struct.unpack_from("<II", data, offset)
        chunk = data[offset + 8: offset + 8 + clen]
        if ctype == 0x4E4F534A:
            js = json.loads(chunk.decode("utf-8"))
        offset += 8 + clen + ((4 - clen % 4) % 4 if clen % 4 else 0)
    if js is None:
        raise SystemExit(f"{path}: no JSON chunk")
    return js


def main() -> int:
    path = sys.argv[1] if len(sys.argv) > 1 else "public/models/act1.glb"
    if not os.path.exists(path):
        print(f"{path} is absent. The viewport will loft the parametric airframe instead, "
              f"which is a supported state, not a failure.")
        return 0

    size = os.path.getsize(path)
    js = read_glb(path)
    meshes = js.get("meshes", [])
    nodes = js.get("nodes", [])
    names = [n.get("name", "") for n in nodes] + [m.get("name", "") for m in meshes]
    names = [n for n in names if n]

    prims = [p for m in meshes for p in m.get("primitives", [])]
    with_normals = sum(1 for p in prims if "NORMAL" in p.get("attributes", {}))
    non_tri = [p for p in prims if p.get("mode", 4) != 4]
    tri_count = 0
    accessors = js.get("accessors", [])
    for p in prims:
        idx = p.get("indices")
        if idx is not None and idx < len(accessors):
            tri_count += accessors[idx].get("count", 0) // 3

    resolved = sorted({resolve(n) for n in names}) if names else []
    problems: list[str] = []
    if size > MAX_BYTES:
        problems.append(f"{size / 1e6:.2f} MB exceeds the 4 MB ceiling")
    if prims and with_normals < len(prims):
        problems.append(f"{len(prims) - with_normals} of {len(prims)} primitives have no NORMAL "
                        f"attribute; the surface will render as a flat silhouette")
    if non_tri:
        problems.append(f"{len(non_tri)} primitives are not triangles")
    if js.get("images"):
        problems.append(f"{len(js['images'])} textures are embedded; none are needed and they "
                        f"only add weight")

    print(f"{path}")
    print(f"  {size / 1e6:.2f} MB, glTF 2.0, {len(meshes)} meshes, {len(prims)} primitives, "
          f"{tri_count} triangles")
    print(f"  generator: {js.get('asset', {}).get('generator', 'unstated')}")
    print(f"  named nodes: {', '.join(names[:12]) if names else 'none'}")
    print(f"  resolves to parts: {', '.join(resolved) if resolved else 'body (single surface)'}")
    missing = [p for p in ("radome", "wing", "engine") if p not in resolved]
    if missing:
        print(f"  not addressable separately: {', '.join(missing)} "
              f"(legal, but the field cannot be scoped to them)")
    if problems:
        print("  PROBLEMS")
        for p in problems:
            print(f"    ! {p}")
        return 1
    print("  contract satisfied")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
