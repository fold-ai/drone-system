"use client";

import { create } from "zustand";
import { DEFAULT_MISSION_SPEC, type MissionSpec } from "@/lib/types";

/**
 * The optimisation page's state.
 *
 * The search runs as a job on the server. This store does nothing but start it,
 * poll it and hold what came back, because every evaluation must be a real
 * solver call written to the run table, and a browser that computed anything
 * itself would be a second implementation of the physics.
 */

export interface DesignVariable {
  key: string;
  label: string;
  unit: string;
  lo: number;
  hi: number;
  path: string;
  note?: string;
}

export interface BestDesign {
  values: Record<string, number>;
  evaluation: {
    objective: number;
    feasible: boolean;
    violations?: string[];
    range_km?: number;
    endurance_s?: number;
    ld_max?: number;
    max_level_mach?: number;
    exit_margin?: number;
    min_static_margin?: number;
  } | null;
  spec: MissionSpec | null;
}

export interface Review {
  summary?: string;
  binding?: { constraint: string; evidence: string }[];
  worth_effort?: { parameter: string; why: string }[];
  investigate_next?: string[];
  caveats?: string[];
}

export interface Verification {
  numbers_checked: number;
  unverified: { text: string; nearest_source_value: number | null }[];
}

export type Phase = "idle" | "starting" | "running" | "paused" | "done" | "failed" | "cancelled";

export const OBJECTIVES = [
  { key: "range_km", label: "Range", unit: "km" },
  { key: "endurance_s", label: "Endurance", unit: "s" },
  { key: "ld_max", label: "Peak L/D", unit: "" },
  { key: "blend", label: "Range and endurance", unit: "" },
] as const;

/**
 * Mirrors ConstraintSpec in api/_core/optimise.py. Keys the solver does not
 * recognise are dropped there, so a mismatch here silently removes a
 * constraint; the labels are kept next to the values for that reason.
 */
export interface ConstraintDef {
  key: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  note?: string;
}

export const CONSTRAINTS: ConstraintDef[] = [
  { key: "exit_margin_min", label: "Rail exit margin", value: 1.15, min: 1.0, max: 2.0, step: 0.05,
    note: "Exit speed over stall speed at the end of the rail" },
  { key: "static_margin_min", label: "Static margin, least", value: 0.03, min: 0.0, max: 0.25,
    step: 0.01, note: "Fraction of MAC, at the worst point in the flight" },
  { key: "n_max", label: "Load factor ceiling", value: 4.0, min: 2.0, max: 9.0, step: 0.5 },
  { key: "cl_max_fraction", label: "Cruise CL as a fraction of CL max", value: 0.9,
    min: 0.5, max: 1.0, step: 0.05 },
  { key: "fuel_capacity_max_kg", label: "Tank volume, most", value: 6.0, min: 0.5, max: 12.0,
    step: 0.5, note: "The airframe has to hold it" },
  { key: "max_length_m", label: "Length ceiling", value: 3.2, min: 1.2, max: 4.0, step: 0.1 },
] as const;

export const DEFAULT_CONSTRAINTS: Record<string, number> = Object.fromEntries(
  CONSTRAINTS.map((c) => [c.key, c.value]),
);

interface State {
  id: string | null;
  phase: Phase;
  message: string;
  base: MissionSpec;
  objective: string;
  keys: string[];
  variables: DesignVariable[];
  constraints: Record<string, number>;
  population: number;
  target: number;
  nEvals: number;
  nFeasible: number;
  best: BestDesign | null;
  history: { evals: number; objective: number }[];
  batchMs: number;

  review: Review | null;
  reviewSource: Record<string, unknown> | null;
  verification: Verification | null;
  reviewPhase: "idle" | "running" | "done" | "failed";
  reviewError: string;
  reviewUsage: { cost_usd?: number; cap_usd?: number; over_budget?: boolean } | null;
  reviewModel: string;
  reviewCached: boolean;

  setObjective: (o: string) => void;
  toggleKey: (k: string) => void;
  setConstraint: (k: string, v: number) => void;
  setTarget: (n: number) => void;
  setPopulation: (n: number) => void;
  setBaseLength: (m: number) => void;
  start: () => Promise<void>;
  pause: () => void;
  resume: () => void;
  cancel: () => Promise<void>;
  requestReview: (force?: boolean) => Promise<void>;
}

const ALL_KEYS = [
  "length_m", "aspect_ratio", "cd0_sub", "mach_dd", "oswald_e",
  "mass_payload_kg", "fuel_capacity_kg", "rail_length_m", "booster_impulse_ns",
];

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export const useOptimise = create<State>((set, get) => ({
  id: null,
  phase: "idle",
  message: "",
  base: clone(DEFAULT_MISSION_SPEC),
  objective: "range_km",
  keys: [...ALL_KEYS],
  variables: [],
  constraints: { ...DEFAULT_CONSTRAINTS },
  population: 24,
  target: 600,
  nEvals: 0,
  nFeasible: 0,
  best: null,
  history: [],
  batchMs: 0,

  review: null,
  reviewSource: null,
  verification: null,
  reviewPhase: "idle",
  reviewError: "",
  reviewUsage: null,
  reviewModel: "",
  reviewCached: false,

  setObjective: (o) => set({ objective: o }),
  toggleKey: (k) =>
    set((s) => {
      const next = s.keys.includes(k) ? s.keys.filter((x) => x !== k) : [...s.keys, k];
      return { keys: next.length ? next : s.keys };
    }),
  setConstraint: (k, v) => set((s) => ({ constraints: { ...s.constraints, [k]: v } })),
  setTarget: (n) => set({ target: Math.max(50, Math.min(5000, Math.round(n))) }),
  setPopulation: (n) => set({ population: Math.max(8, Math.min(64, Math.round(n))) }),
  setBaseLength: (m) =>
    set((s) => {
      const base = clone(s.base);
      base.airframe.length_m = m;
      return { base };
    }),

  async start() {
    const s = get();
    if (s.phase === "starting" || s.phase === "running") return;
    set({
      phase: "starting", message: "", id: null, nEvals: 0, nFeasible: 0,
      best: null, history: [], review: null, reviewSource: null, verification: null,
      reviewPhase: "idle", reviewError: "",
    });
    try {
      const res = await fetch("/jobs/optimise", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "start", objective: s.objective, keys: s.keys, base: s.base,
          constraints: s.constraints, population: s.population, n_evals_target: s.target,
        }),
      });
      const json = (await res.json()) as {
        ok: boolean; id?: string; variables?: DesignVariable[]; error?: string;
      };
      if (!json.ok || !json.id) throw new Error(json.error ?? "could not start the search");
      set({ id: json.id, variables: json.variables ?? [], phase: "running" });
      void pump();
    } catch (err) {
      set({ phase: "failed", message: err instanceof Error ? err.message : String(err) });
    }
  },

  pause: () => set((s) => (s.phase === "running" ? { phase: "paused" } : {})),
  resume: () =>
    set((s) => {
      if (s.phase !== "paused") return {};
      queueMicrotask(() => void pump());
      return { phase: "running" };
    }),

  async cancel() {
    const { id } = get();
    set({ phase: "cancelled" });
    if (!id) return;
    await fetch("/jobs/optimise", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "cancel", id }),
    }).catch(() => undefined);
  },

  async requestReview(force = false) {
    const { id, reviewPhase } = get();
    if (!id || reviewPhase === "running") return;
    set({ reviewPhase: "running", reviewError: "", reviewCached: false });
    try {
      const res = await fetch("/jobs/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ optimisationId: id, force }),
      });
      const json = (await res.json()) as {
        ok: boolean; review?: Review; source?: Record<string, unknown>;
        verification?: Verification | null; error?: string; model?: string;
        cached?: boolean; usage?: { cost_usd?: number; cap_usd?: number; over_budget?: boolean };
      };
      // The source data is worth showing even when the model could not be
      // reached: it is the part that was computed.
      if (json.source) set({ reviewSource: json.source });
      if (!json.ok) throw new Error(json.error ?? "the review failed");
      set({
        reviewPhase: "done", review: json.review ?? null,
        verification: json.verification ?? null, reviewUsage: json.usage ?? null,
        reviewModel: json.model ?? "", reviewCached: Boolean(json.cached),
      });
    } catch (err) {
      set({
        reviewPhase: "failed",
        reviewError: err instanceof Error ? err.message : String(err),
      });
    }
  },
}));

/** Drive the job forward one batch at a time for as long as it is running. */
async function pump(): Promise<void> {
  for (;;) {
    const s = useOptimise.getState();
    if (s.phase !== "running" || !s.id) return;
    const t0 = performance.now();
    try {
      const res = await fetch("/jobs/optimise", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "step", id: s.id, budget: 120, deadline_s: 20 }),
      });
      const json = (await res.json()) as {
        ok: boolean; done?: boolean; status?: string; n_evals?: number;
        feasible_evals?: number; best?: BestDesign; error?: string;
      };
      if (!json.ok) throw new Error(json.error ?? "the search step failed");

      const objective = json.best?.evaluation?.objective;
      useOptimise.setState((cur) => ({
        nEvals: json.n_evals ?? cur.nEvals,
        nFeasible: json.feasible_evals ?? cur.nFeasible,
        best: json.best ?? cur.best,
        batchMs: performance.now() - t0,
        history:
          typeof objective === "number"
            ? [...cur.history, { evals: json.n_evals ?? cur.nEvals, objective }]
            : cur.history,
      }));

      if (json.done) {
        useOptimise.setState({
          phase: (json.status as Phase) ?? "done",
          message: "",
        });
        return;
      }
    } catch (err) {
      useOptimise.setState({
        phase: "failed",
        message: err instanceof Error ? err.message : String(err),
      });
      return;
    }
  }
}
