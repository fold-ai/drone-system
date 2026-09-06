/**
 * Cross-window playback sync.
 *
 * The aerodynamics panel detaches into a real second browser window so it can
 * live on a second monitor during a test review. The two windows share the
 * playback cursor and the solved run over a BroadcastChannel. The main window
 * owns the clock; the detached window follows it and never solves.
 */
import type { Run } from "./playback";

export const CHANNEL = "reaper-sim";

export type Message =
  | { kind: "cursor"; t: number; playing: boolean; speed: number }
  | { kind: "run"; payload: SerialisedRun | null }
  | { kind: "hello" }
  | { kind: "detach-closed" };

export interface SerialisedRun {
  id: string;
  label: string;
  n: number;
  t0: number;
  t1: number;
  columns: string[];
  buffer: ArrayBuffer;
  summary: Run["summary"];
  mach1: Run["mach1"];
  machSweep: Run["machSweep"];
  derived: Run["derived"];
  spec: Run["spec"];
  events: Run["events"];
  warnings: string[];
}

export function serialiseRun(run: Run): SerialisedRun {
  const src = run.cols as Record<string, Float32Array | undefined>;
  const columns = Object.keys(src).filter((k) => src[k]);
  const buffer = new ArrayBuffer(columns.length * run.n * 4);
  const view = new Float32Array(buffer);
  columns.forEach((name, i) => {
    const col = src[name];
    if (col) view.set(col.subarray(0, run.n), i * run.n);
  });
  return {
    id: run.id,
    label: run.label,
    n: run.n,
    t0: run.t0,
    t1: run.t1,
    columns,
    buffer,
    summary: run.summary,
    mach1: run.mach1,
    machSweep: run.machSweep,
    derived: run.derived,
    spec: run.spec,
    events: run.events,
    warnings: run.warnings,
  };
}

export function deserialiseRun(s: SerialisedRun): Run {
  const cols: Record<string, Float32Array> = {};
  s.columns.forEach((name, i) => {
    cols[name] = new Float32Array(s.buffer, i * s.n * 4, s.n);
  });
  return {
    id: s.id,
    label: s.label,
    spec: s.spec,
    summary: s.summary,
    events: s.events,
    fuel: null as never,
    launch: null as never,
    mach1: s.mach1,
    machSweep: s.machSweep,
    resolved: null as never,
    derived: s.derived,
    warnings: s.warnings,
    cols: cols as Run["cols"],
    n: s.n,
    t0: s.t0,
    t1: s.t1,
    solvedAt: Date.now(),
    roundTripMs: 0,
  };
}

export function open(): BroadcastChannel | null {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return null;
  return new BroadcastChannel(CHANNEL);
}
