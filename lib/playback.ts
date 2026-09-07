/**
 * Trajectory decoding and playback sampling.
 *
 * The solver is authoritative and batch: it returns the whole flight at 50 Hz
 * and the browser plays that back against a clock. Nothing here computes
 * physics. It decodes the wire format, finds the sample either side of the
 * playback cursor and interpolates between them.
 */
import type {
  Derived,
  EncodedTrajectory,
  FlightEvent,
  FuelBudget,
  LaunchFeasibility,
  Mach1Deficit,
  MachSweepPoint,
  MissionSpec,
  ResolvedProfile,
  SimulationResponse,
  TrajectoryColumn,
  TrajectorySummary,
} from "./types";
import {
  TRAJECTORY_COLUMNS,
  TRAJECTORY_FORMAT_F32,
  TRAJECTORY_FORMAT_F32_RAW,
} from "./types";

export type Columns = Partial<Record<TrajectoryColumn, Float32Array>>;

export interface Run {
  id: string;
  label: string;
  spec: MissionSpec;
  summary: TrajectorySummary;
  events: FlightEvent[];
  fuel: FuelBudget;
  launch: LaunchFeasibility;
  mach1: Mach1Deficit;
  machSweep: MachSweepPoint[];
  resolved: ResolvedProfile;
  derived: Derived;
  warnings: string[];
  cols: Columns;
  n: number;
  t0: number;
  t1: number;
  solvedAt: number;
  roundTripMs: number;
  /**
   * The trajectory exactly as the solver sent it: deflated, byte-plane
   * shuffled, base64. Kept so a run can be stored verbatim rather than
   * re-encoded here, which would be a second implementation of the wire format
   * and would drift from the first one.
   *
   * Absent on a run rebuilt from a cross-tab broadcast, which carries decoded
   * columns and never the original bytes. Such a run can be compared against
   * but not stored.
   */
  encoded?: EncodedTrajectory;
}

export type Sample = Record<TrajectoryColumn, number>;

const LITTLE_ENDIAN = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

async function base64ToBytes(b64: string): Promise<Uint8Array> {
  // The data: URL path hands the decode to the platform. For megabytes of
  // base64 that is roughly an order of magnitude quicker than a character loop.
  try {
    const res = await fetch(`data:application/octet-stream;base64,${b64}`);
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error(
      "This browser has no DecompressionStream. Request the trajectory with " +
        "?format=f32raw to receive it uncompressed.",
    );
  }
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Undo the byte-plane shuffle: plane k holds byte k of every float in order. */
function unshuffle(planes: Uint8Array): Uint8Array {
  const total = planes.length;
  const count = total >> 2;
  const out = new Uint8Array(total);
  for (let k = 0; k < 4; k += 1) {
    const base = k * count;
    for (let i = 0; i < count; i += 1) out[i * 4 + k] = planes[base + i];
  }
  return out;
}

export async function decodeTrajectory(enc: EncodedTrajectory): Promise<Columns> {
  const cols: Columns = {};
  if (enc.format !== TRAJECTORY_FORMAT_F32 && enc.format !== TRAJECTORY_FORMAT_F32_RAW) {
    const raw = enc.data as Record<string, number[]>;
    for (const name of enc.columns) cols[name] = Float32Array.from(raw[name] ?? []);
    return cols;
  }
  let bytes = await base64ToBytes(enc.data as string);
  if (enc.format === TRAJECTORY_FORMAT_F32) bytes = unshuffle(await inflate(bytes));
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  if (!LITTLE_ENDIAN) {
    const view = new DataView(buf);
    for (let i = 0; i < buf.byteLength; i += 4) {
      view.setFloat32(i, view.getFloat32(i, true), false);
    }
  }
  const n = enc.n;
  enc.columns.forEach((name, i) => {
    cols[name] = new Float32Array(buf, i * n * 4, n);
  });
  return cols;
}

export async function toRun(
  res: SimulationResponse,
  label: string,
  roundTripMs: number,
): Promise<Run> {
  const cols = await decodeTrajectory(res.trajectory);
  const t = cols.t ?? new Float32Array(0);
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    label,
    spec: res.spec,
    summary: res.summary,
    events: res.events,
    fuel: res.fuel,
    launch: res.launch,
    mach1: res.mach1,
    machSweep: res.mach_sweep,
    resolved: res.resolved,
    derived: res.derived,
    warnings: res.warnings ?? [],
    cols,
    n: res.trajectory.n,
    t0: t.length ? t[0] : 0,
    t1: t.length ? t[t.length - 1] : 0,
    solvedAt: Date.now(),
    roundTripMs,
    encoded: res.trajectory,
  };
}

/** Index of the last sample at or before `t`. Binary search: the grid is uniform
 *  after the rail phase but the rail samples make no promise of that. */
export function indexAt(run: Run, t: number): number {
  const ts = run.cols.t;
  if (!ts || ts.length === 0) return 0;
  if (t <= ts[0]) return 0;
  if (t >= ts[ts.length - 1]) return ts.length - 1;
  let lo = 0;
  let hi = ts.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ts[mid] <= t) lo = mid;
    else hi = mid;
  }
  return lo;
}

const INT_COLUMNS = new Set<TrajectoryColumn>([
  "wave_drag_active",
  "stall_limited",
  "lift_limited",
  "phase",
]);

/** Linear interpolation between the bracketing samples. Flags and the phase
 *  index are held, never blended - a half-stalled sample would be a fiction. */
export function sampleAt(run: Run, t: number): Sample {
  const out = {} as Sample;
  const ts = run.cols.t;
  if (!ts || ts.length === 0) {
    for (const c of TRAJECTORY_COLUMNS) out[c] = 0;
    return out;
  }
  const i = indexAt(run, t);
  const j = Math.min(i + 1, ts.length - 1);
  const span = ts[j] - ts[i];
  const f = span > 1e-9 ? Math.min(1, Math.max(0, (t - ts[i]) / span)) : 0;
  for (const c of TRAJECTORY_COLUMNS) {
    const col = run.cols[c];
    if (!col) {
      out[c] = 0;
      continue;
    }
    out[c] = INT_COLUMNS.has(c) ? col[i] : col[i] + (col[j] - col[i]) * f;
  }
  return out;
}

/** Splice a re-solve into an existing run from the moment the operator changed
 *  something. Samples before `t` are the flight that was already flown. */
export function spliceRun(base: Run, tail: Run, t: number): Run {
  const cut = indexAt(base, t) + 1;
  const cols: Columns = {};
  const n = cut + tail.n;
  for (const c of TRAJECTORY_COLUMNS) {
    const a = base.cols[c];
    const b = tail.cols[c];
    if (!a && !b) continue;
    const merged = new Float32Array(n);
    if (a) merged.set(a.subarray(0, Math.min(cut, a.length)), 0);
    if (b) merged.set(b.subarray(0, tail.n), cut);
    cols[c] = merged;
  }
  const ts = cols.t ?? new Float32Array(0);
  return {
    ...tail,
    id: `${base.id}+${tail.id.slice(-5)}`,
    label: base.label,
    cols,
    n,
    t0: ts.length ? ts[0] : base.t0,
    t1: ts.length ? ts[ts.length - 1] : tail.t1,
    events: [...base.events.filter((e) => e.t < t), ...tail.events.filter((e) => e.t >= t)],
    warnings: tail.warnings,
  };
}

/** Column extent, ignoring the non-finite values a float32 round trip can leave. */
export function extent(col: Float32Array | undefined): [number, number] {
  if (!col || col.length === 0) return [0, 1];
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < col.length; i += 1) {
    const v = col[i];
    if (!Number.isFinite(v)) continue;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (lo === Infinity) return [0, 1];
  if (lo === hi) return [lo - 0.5, hi + 0.5];
  return [lo, hi];
}

/** Full trajectory as CSV, built in the browser from the decoded columns.
 *  No round trip, and the file matches exactly what is on screen. */
export function runToCsv(run: Run): string {
  const names = TRAJECTORY_COLUMNS.filter((c) => run.cols[c]);
  const cols = names.map((c) => run.cols[c] as Float32Array);
  const lines = new Array<string>(run.n + 1);
  lines[0] = names.join(",");
  const row = new Array<string>(names.length);
  for (let i = 0; i < run.n; i += 1) {
    for (let c = 0; c < cols.length; c += 1) {
      const v = cols[c][i];
      row[c] = Number.isFinite(v) ? String(Math.round(v * 1e6) / 1e6) : "";
    }
    lines[i + 1] = row.join(",");
  }
  return `${lines.join("\n")}\n`;
}
