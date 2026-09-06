/**
 * Study page state.
 *
 * Separate from the console store on purpose: this page runs its own solves
 * against its own working specification, and edits here must not disturb a
 * mission the operator has loaded next door. It listens to the console's
 * broadcast only to mark the current operating point.
 */
"use client";

import { create } from "zustand";
import { study as fetchStudy, SolverError } from "@/app/api-client";
import {
  DEFAULT_MISSION_SPEC,
  type MissionSpec,
  type PolarResult,
  type SensitivityResult,
  type StudyOp,
  type SweepResult,
} from "./types";

export type Phase = "idle" | "running" | "error";

interface Job {
  phase: Phase;
  error: string | null;
  ms: number;
}

const IDLE: Job = { phase: "idle", error: null, ms: 0 };

interface State {
  spec: MissionSpec;
  polar: PolarResult | null;
  sensitivity: SensitivityResult | null;
  sweep: SweepResult | null;
  jobs: Record<StudyOp, Job>;

  /** Operating point broadcast by the console, when a trajectory is loaded. */
  operating: { mach: number; cl: number; cd: number; ld: number; label: string } | null;

  setField: (path: string, value: number | boolean) => void;
  resetSpec: () => void;
  setSpec: (spec: MissionSpec) => void;
  setOperating: (p: State["operating"]) => void;
  run: (op: StudyOp, args?: Record<string, unknown>) => Promise<void>;
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  let node = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    node = node[parts[i]] as Record<string, unknown>;
    if (!node) return;
  }
  node[parts[parts.length - 1]] = value;
}

export function readPath(obj: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>((a, k) => (a == null ? undefined : (a as Record<string, unknown>)[k]), obj);
}

/** Aspect ratio is not a field; it is span at constant reference area. */
export function readParam(spec: MissionSpec, path: string): number {
  if (path === "airframe.aspect_ratio") {
    return (spec.airframe.span_m * spec.airframe.span_m) / spec.airframe.wing_area_m2;
  }
  const v = readPath(spec, path);
  return typeof v === "number" ? v : 0;
}

export const useStudy = create<State>((set, get) => ({
  spec: clone(DEFAULT_MISSION_SPEC),
  polar: null,
  sensitivity: null,
  sweep: null,
  jobs: { polar: IDLE, sensitivity: IDLE, sweep: IDLE, planform: IDLE },
  operating: null,

  setField: (path, value) => {
    const spec = clone(get().spec) as unknown as Record<string, unknown>;
    setPath(spec, path, value);
    set({ spec: spec as unknown as MissionSpec });
  },
  resetSpec: () => set({ spec: clone(DEFAULT_MISSION_SPEC) }),
  setSpec: (spec) => set({ spec: clone(spec) }),
  setOperating: (p) => set({ operating: p }),

  run: async (op, args = {}) => {
    set({ jobs: { ...get().jobs, [op]: { phase: "running", error: null, ms: 0 } } });
    const t0 = performance.now();
    try {
      const res = await fetchStudy(get().spec, op, args);
      const ms = performance.now() - t0;
      set({
        jobs: { ...get().jobs, [op]: { phase: "idle", error: null, ms } },
        ...(res.polar ? { polar: res.polar } : {}),
        ...(res.sensitivity ? { sensitivity: res.sensitivity } : {}),
        ...(res.sweep ? { sweep: res.sweep } : {}),
      });
    } catch (err) {
      const e = err as SolverError;
      set({
        jobs: {
          ...get().jobs,
          [op]: { phase: "error", error: e.message ?? String(err), ms: performance.now() - t0 },
        },
      });
    }
  },
}));
