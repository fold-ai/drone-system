"""Wire encoding for the trajectory.

A 300 s mission at 50 Hz is 15 000 samples across 41 columns; a 150 km mission
is 43 000. As JSON numbers that is 5 MB and 14 MB, both over the 4.5 MB
serverless response limit, and it costs the browser a parse of hundreds of
thousands of numbers before the first frame can be drawn.

The columns therefore travel as one float32 buffer, byte-plane shuffled,
deflated and base64 encoded. The shuffle groups every float's first byte
together, then every second byte, and so on. Across smooth telemetry the
exponent and high-mantissa planes are nearly constant, so deflate finds the
redundancy that interleaved bytes hide from it:

    150 km mission   7.03 MB float32   9.38 MB as base64
                                       0.97 MB shuffled, deflated, base64

Nothing is lost. float32 carries about seven significant digits, finer than any
quantity here is known to, and the compression is exact. The browser undoes it
with DecompressionStream, which is native.

`format=json` returns plain arrays instead - the tests and the CSV export use
that path - and `format=f32raw` returns the uncompressed buffer.
"""
from __future__ import annotations

import base64
import zlib
from array import array
from typing import Dict, List, Sequence

from .schema import Trajectory

FORMAT_F32 = "f32-le-shuffle-deflate-base64"
FORMAT_F32_RAW = "f32-le-base64"
FORMAT_JSON = "json"

#: Response bodies above this are refused by the serverless runtime. The encoder
#: drops the output rate rather than emit something that cannot be delivered.
MAX_ENCODED_BYTES = 4_000_000

_LITTLE_ENDIAN = array("f", [1.0]).tobytes() == b"\x00\x00\x80\x3f"


def trajectory_columns(traj: Trajectory) -> List[str]:
    return [f.name for f in traj.__dataclass_fields__.values()]


def _resolve(traj: Trajectory, columns: Sequence[str] | None) -> List[str]:
    names = list(columns) if columns else trajectory_columns(traj)
    return [n for n in names if hasattr(traj, n)]


def _pack(traj: Trajectory, names: Sequence[str], stride: int) -> tuple[bytes, int]:
    buf = array("f")
    n = 0
    for name in names:
        col = getattr(traj, name)
        sliced = col[::stride] if stride > 1 else col
        n = len(sliced)
        buf.extend(sliced)
    if not _LITTLE_ENDIAN:
        buf.byteswap()
    return buf.tobytes(), n


def _shuffle(raw: bytes) -> bytes:
    """Group byte 0 of every float, then byte 1, and so on."""
    mv = memoryview(raw)
    return b"".join(bytes(mv[k::4]) for k in range(4))


def encode_f32(traj: Trajectory, columns: Sequence[str] | None = None,
               compress: bool = True) -> Dict[str, object]:
    names = _resolve(traj, columns)
    if not names:
        return {"format": FORMAT_F32 if compress else FORMAT_F32_RAW,
                "columns": [], "n": 0, "data": "", "stride": 1}

    stride = 1
    while True:
        raw, n = _pack(traj, names, stride)
        payload = zlib.compress(_shuffle(raw), 6) if compress else raw
        b64 = base64.b64encode(payload).decode("ascii")
        if len(b64) <= MAX_ENCODED_BYTES or stride >= 16:
            break
        stride *= 2

    out: Dict[str, object] = {
        "format": FORMAT_F32 if compress else FORMAT_F32_RAW,
        "columns": names,
        "n": n,
        "stride": stride,
        "data": b64,
    }
    if stride > 1:
        out["note"] = (f"Trajectory decimated by {stride} to fit the response limit; "
                       f"samples are every {stride * 0.02:.2f} s rather than every 0.02 s.")
    return out


def encode_json(traj: Trajectory, columns: Sequence[str] | None = None) -> Dict[str, object]:
    names = _resolve(traj, columns)
    return {
        "format": FORMAT_JSON,
        "columns": names,
        "n": len(getattr(traj, names[0])) if names else 0,
        "stride": 1,
        "data": {n: getattr(traj, n) for n in names},
    }


def to_csv(traj: Trajectory, columns: Sequence[str] | None = None) -> str:
    """Full trajectory as CSV. One row per sample, header row of column names."""
    names = _resolve(traj, columns)
    cols = [getattr(traj, n) for n in names]
    n = len(cols[0]) if cols else 0
    out = [",".join(names)]
    for i in range(n):
        out.append(",".join(_fmt(c[i]) for c in cols))
    return "\n".join(out) + "\n"


def _fmt(v) -> str:
    if isinstance(v, int):
        return str(v)
    if v == int(v) and abs(v) < 1e15:
        return str(int(v))
    return repr(round(v, 6))
