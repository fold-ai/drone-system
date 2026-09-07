"use client";

import { create } from "zustand";
import { classify } from "@/lib/diagnostics";
import type { Run } from "@/lib/playback";
import type { MissionSpec } from "@/lib/types";

/**
 * Saved test records.
 *
 * A solve that exists only in a browser tab is not a record. This store is the
 * console's and the library's shared view of what is actually in Postgres.
 */

export interface RunRow {
  id: string;
  name: string | null;
  kind: string;
  created_at: string;
  solver_version: string;
  git_sha: string | null;
  airframe_name: string | null;
  range_km: number | null;
  endurance_s: number | null;
  ld_max: number | null;
  max_mach: number | null;
  v_rail_exit_ms: number | null;
  max_load_factor: number | null;
  min_static_margin: number | null;
  feasible: boolean;
  warning_count: number;
  has_trajectory: boolean;
}

export const SORT_COLUMNS = [
  { key: "created_at", label: "Saved" },
  { key: "range_km", label: "Range" },
  { key: "endurance_s", label: "Endurance" },
  { key: "ld_max", label: "L/D" },
  { key: "max_mach", label: "Max Mach" },
  { key: "v_rail_exit_ms", label: "Rail exit" },
  { key: "max_load_factor", label: "Load factor" },
  { key: "warning_count", label: "Warnings" },
] as const;

interface State {
  rows: RunRow[];
  loading: boolean;
  error: string;
  /** Free-text filter, matched against name, solver version and airframe. */
  filter: string;
  /**
   * Which kinds to list. Every optimiser evaluation is written to the same
   * table, because a search whose rejected candidates are not recorded cannot
   * be audited. There are thousands of them, so the library shows deliberately
   * saved runs by default and offers the rest rather than hiding them.
   */
  kind: "single" | "optimisation" | null;
  feasibleOnly: boolean | null;
  sort: string;
  direction: "asc" | "desc";
  /** Selected for comparison. Two at most; the second is the reference. */
  selected: string[];

  saving: boolean;
  saveError: string;
  lastSavedId: string | null;

  refresh: () => Promise<void>;
  setFilter: (v: string) => void;
  setKind: (v: "single" | "optimisation" | null) => void;
  setFeasibleOnly: (v: boolean | null) => void;
  setSort: (key: string) => void;
  toggleSelected: (id: string) => void;
  clearSelection: () => void;
  save: (input: {
    name: string;
    notes: string;
    run: Run;
    pinned?: boolean;
  }) => Promise<string | null>;
  rename: (id: string, name: string, notes: string) => Promise<void>;
  setPinned: (id: string, pinned: boolean) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useRecords = create<State>((set, get) => ({
  rows: [],
  loading: false,
  error: "",
  filter: "",
  kind: "single",
  feasibleOnly: null,
  sort: "created_at",
  direction: "desc",
  selected: [],
  saving: false,
  saveError: "",
  lastSavedId: null,

  async refresh() {
    set({ loading: true, error: "" });
    const s = get();
    const q = new URLSearchParams({ sort: s.sort, direction: s.direction, limit: "300" });
    if (s.kind) q.set("kind", s.kind);
    if (s.feasibleOnly !== null) q.set("feasible", String(s.feasibleOnly));
    try {
      const res = await fetch(`/jobs/runs?${q}`);
      const json = (await res.json()) as { ok: boolean; runs?: RunRow[]; error?: string };
      if (!json.ok) throw new Error(json.error ?? "could not list runs");
      set({ rows: json.runs ?? [], loading: false });
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : String(err) });
    }
  },

  setFilter: (v) => set({ filter: v }),
  setKind: (v) => {
    set({ kind: v, selected: [] });
    void get().refresh();
  },
  setFeasibleOnly: (v) => {
    set({ feasibleOnly: v });
    void get().refresh();
  },
  setSort: (key) => {
    const s = get();
    const direction = s.sort === key && s.direction === "desc" ? "asc" : "desc";
    set({ sort: key, direction });
    void get().refresh();
  },
  toggleSelected: (id) =>
    set((s) => {
      if (s.selected.includes(id)) return { selected: s.selected.filter((x) => x !== id) };
      // Two at a time. A diff of three columns is a table, not a comparison.
      return { selected: [...s.selected, id].slice(-2) };
    }),
  clearSelection: () => set({ selected: [] }),

  async save({ name, notes, run, pinned }) {
    set({ saving: true, saveError: "" });
    try {
      const res = await fetch("/jobs/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          notes,
          spec: run.spec,
          solverVersion: run.summary.solver_version,
          wallMs: Math.round(run.roundTripMs),
          pinned: pinned ?? false,
          sampleHz: run.n > 1 ? Math.round((run.n - 1) / Math.max(1e-6, run.t1 - run.t0)) : 0,
          summary: {
            range_km: run.summary.ground_range_km,
            endurance_s: run.summary.endurance_s,
            ld_max: run.summary.best_ld,
            max_mach: run.summary.max_mach,
            fuel_burn_kg: run.summary.fuel_burned_kg,
            v_rail_exit_ms: run.launch?.v_exit_ms ?? null,
            max_load_factor: run.summary.max_load_factor,
            max_altitude_m: run.summary.max_altitude_m,
            max_q_pa: run.summary.max_q_pa,
            min_static_margin: run.summary.min_static_margin,
            feasible: run.launch?.feasible !== false && !run.summary.ground_impact,
          },
          // Classified by the same rules the console displays, so the stored
          // severity is the one the operator saw rather than a second opinion.
          warnings: classify(run).map((d) => ({
            severity: d.severity, code: d.topic, message: d.text, t_s: d.t,
          })),
          events: run.events.map((e) => ({
            t_s: e.t, kind: e.kind, label: e.label, detail: e.detail || null,
          })),
          trajectory: run.encoded ?? null,
        }),
      });
      const json = (await res.json()) as { ok: boolean; id?: string; error?: string };
      if (!json.ok) throw new Error(json.error ?? "could not save the run");
      set({ saving: false, lastSavedId: json.id ?? null });
      void get().refresh();
      return json.id ?? null;
    } catch (err) {
      set({ saving: false, saveError: err instanceof Error ? err.message : String(err) });
      return null;
    }
  },

  async rename(id, name, notes) {
    await fetch("/jobs/runs", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, name, notes }),
    });
    void get().refresh();
  },

  async setPinned(id, pinned) {
    await fetch("/jobs/runs", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, pinned }),
    });
    void get().refresh();
  },

  async remove(id) {
    const res = await fetch(`/jobs/runs?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    const json = (await res.json()) as { ok: boolean; error?: string };
    if (!json.ok) set({ error: json.error ?? "could not delete the run" });
    set((s) => ({ selected: s.selected.filter((x) => x !== id) }));
    void get().refresh();
  },
}));

/** Rows after the free-text filter, which is applied in the browser. */
export function visibleRows(rows: RunRow[], filter: string): RunRow[] {
  const q = filter.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) =>
    [r.name, r.solver_version, r.airframe_name, r.kind, r.git_sha]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q)),
  );
}

export interface LoadedRun {
  spec: MissionSpec;
  name: string;
  notes: string | null;
  summary: Record<string, unknown>;
  trajectory: { format: string; columns: string[]; n: number; stride: number; data: string } | null;
}

export async function fetchRun(id: string): Promise<LoadedRun> {
  const res = await fetch(`/jobs/runs?id=${encodeURIComponent(id)}`);
  const json = (await res.json()) as {
    ok: boolean;
    run?: Record<string, unknown>;
    trajectory?: LoadedRun["trajectory"];
    error?: string;
  };
  if (!json.ok || !json.run) throw new Error(json.error ?? "could not load the run");
  return {
    spec: json.run.spec_json as MissionSpec,
    name: (json.run.name as string) ?? "unnamed",
    notes: (json.run.notes as string) ?? null,
    summary: json.run,
    trajectory: json.trajectory ?? null,
  };
}
