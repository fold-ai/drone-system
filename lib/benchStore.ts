"use client";

import { create } from "zustand";
import { DEFAULT_MISSION_SPEC, type MissionSpec } from "@/lib/types";

/**
 * Bench and flight data against the model.
 *
 * The residuals are computed by the solver. This store carries the file, the
 * mapping decision and what came back.
 */

export interface QuantityCondition {
  key: string;
  label: string;
  unit: string;
  required: boolean;
  default: number | null;
  aliases: string[];
}

export interface Quantity {
  key: string;
  label: string;
  unit: string;
  kind: string;
  conditions: QuantityCondition[];
  aliases: string[];
  note: string;
}

export interface ResidualRow {
  row: number;
  condition: Record<string, number>;
  measured: number;
  model: number;
  residual: number;
  residual_pct: number;
}

export interface Comparison {
  quantity: string;
  label: string;
  unit: string;
  kind: string;
  n: number;
  rows: ResidualRow[];
  bias: number;
  rms: number;
  max_abs: number;
  bias_pct: number;
  rms_pct: number;
  r2: number;
  skipped: string[];
  note: string;
}

export interface ImportRow {
  id: string;
  source: string;
  kind: string;
  recorded_at: string | null;
  uploaded_at: string;
  notes: string | null;
  row_count: number | null;
  n_points: string;
  bias: string | null;
  rms: string | null;
  max_abs: string | null;
  quantity: string | null;
  unit: string | null;
  column_map: { quantity?: string; mapping?: Record<string, string> } | null;
}

interface State {
  spec: MissionSpec;
  fileName: string;
  csv: string;
  header: string[];
  preview: string[];
  suggestions: { column: string; role: string; confidence: string }[];
  quantities: Quantity[];
  quantity: string;
  mapping: Record<string, string>;
  source: string;
  notes: string;
  recordedAt: string;

  comparison: Comparison | null;
  phase: "idle" | "reading" | "ready" | "comparing" | "compared" | "saving" | "failed";
  error: string;
  savedId: string | null;

  imports: ImportRow[];
  loadingImports: boolean;

  setSpecLength: (m: number) => void;
  setQuantity: (key: string) => void;
  setMapping: (role: string, column: string) => void;
  setField: (k: "source" | "notes" | "recordedAt", v: string) => void;
  acceptFile: (name: string, text: string) => Promise<void>;
  compare: () => Promise<void>;
  save: () => Promise<void>;
  refreshImports: () => Promise<void>;
  openImport: (id: string) => Promise<void>;
  removeImport: (id: string) => Promise<void>;
  reset: () => void;
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

const EMPTY = {
  fileName: "", csv: "", header: [] as string[], preview: [] as string[],
  suggestions: [] as { column: string; role: string; confidence: string }[],
  mapping: {} as Record<string, string>, comparison: null,
  phase: "idle" as const, error: "", savedId: null,
};

export const useBench = create<State>((set, get) => ({
  spec: clone(DEFAULT_MISSION_SPEC),
  ...EMPTY,
  quantities: [],
  quantity: "thrust_n",
  source: "",
  notes: "",
  recordedAt: "",
  imports: [],
  loadingImports: false,

  setSpecLength: (m) =>
    set((s) => {
      const spec = clone(s.spec);
      spec.airframe.length_m = m;
      return { spec };
    }),

  setQuantity: (key) => {
    set({ quantity: key, comparison: null });
    // Re-apply the sniffed guesses for the new quantity's roles.
    const s = get();
    const q = s.quantities.find((x) => x.key === key);
    if (!q) return;
    const wanted = new Set([key, ...q.conditions.map((c) => c.key)]);
    const mapping: Record<string, string> = {};
    for (const sug of s.suggestions) {
      if (sug.role && wanted.has(sug.role) && !mapping[sug.role]) mapping[sug.role] = sug.column;
    }
    set({ mapping });
  },

  setMapping: (role, column) =>
    set((s) => ({ mapping: { ...s.mapping, [role]: column }, comparison: null })),

  setField: (k, v) => set({ [k]: v } as Pick<State, typeof k>),

  async acceptFile(name, text) {
    set({ ...EMPTY, fileName: name, csv: text, phase: "reading" });
    try {
      const res = await fetch("/jobs/bench", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "sniff", csv: text }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        columns?: { column: string; role: string; confidence: string }[];
        quantities?: Quantity[];
        preview?: string[];
        error?: string;
      };
      if (!json.ok) throw new Error(json.error ?? "could not read that file");
      const suggestions = json.columns ?? [];
      const quantities = json.quantities ?? get().quantities;

      // Pick the quantity the file appears to hold, rather than making the
      // operator find it in a list.
      const found = suggestions.find((c) => quantities.some((q) => q.key === c.role));
      const quantity = found?.role ?? get().quantity;
      const q = quantities.find((x) => x.key === quantity);
      const wanted = new Set([quantity, ...(q?.conditions ?? []).map((c) => c.key)]);
      const mapping: Record<string, string> = {};
      for (const sug of suggestions) {
        if (sug.role && wanted.has(sug.role) && !mapping[sug.role]) mapping[sug.role] = sug.column;
      }

      set({
        suggestions, quantities, quantity, mapping,
        header: suggestions.map((c) => c.column),
        preview: json.preview ?? [],
        phase: "ready",
      });
    } catch (err) {
      set({ phase: "failed", error: err instanceof Error ? err.message : String(err) });
    }
  },

  async compare() {
    const s = get();
    if (!s.csv) return;
    set({ phase: "comparing", error: "", comparison: null });
    try {
      const res = await fetch("/jobs/bench", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "compare", csv: s.csv, quantity: s.quantity,
          mapping: s.mapping, spec: s.spec,
        }),
      });
      const json = (await res.json()) as { ok: boolean; comparison?: Comparison; error?: string };
      if (!json.ok || !json.comparison) throw new Error(json.error ?? "the comparison failed");
      set({ comparison: json.comparison, phase: "compared" });
    } catch (err) {
      set({ phase: "failed", error: err instanceof Error ? err.message : String(err) });
    }
  },

  async save() {
    const s = get();
    if (!s.comparison) return;
    set({ phase: "saving", error: "" });
    try {
      const res = await fetch("/jobs/bench", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "save", csv: s.csv, quantity: s.quantity, mapping: s.mapping,
          spec: s.spec, source: s.source, notes: s.notes,
          recordedAt: s.recordedAt || null, kind: s.comparison.kind,
        }),
      });
      const json = (await res.json()) as { ok: boolean; benchRunId?: string; error?: string };
      if (!json.ok) throw new Error(json.error ?? "could not save the import");
      set({ phase: "compared", savedId: json.benchRunId ?? null });
      void get().refreshImports();
    } catch (err) {
      set({ phase: "failed", error: err instanceof Error ? err.message : String(err) });
    }
  },

  async refreshImports() {
    set({ loadingImports: true });
    try {
      const res = await fetch("/jobs/bench");
      const json = (await res.json()) as { ok: boolean; imports?: ImportRow[] };
      set({ imports: json.imports ?? [], loadingImports: false });
    } catch {
      set({ loadingImports: false });
    }
  },

  async openImport(id) {
    try {
      const res = await fetch(`/jobs/bench?id=${encodeURIComponent(id)}`);
      const json = (await res.json()) as {
        ok: boolean;
        benchRun?: ImportRow;
        points?: {
          quantity: string; condition_json: Record<string, number>;
          measured: string; model: string; residual: string; unit: string;
        }[];
        error?: string;
      };
      if (!json.ok || !json.benchRun) throw new Error(json.error ?? "could not open that import");
      const points = json.points ?? [];
      const rows: ResidualRow[] = points.map((p, i) => ({
        row: i + 1,
        condition: p.condition_json,
        measured: Number(p.measured),
        model: Number(p.model),
        residual: Number(p.residual),
        residual_pct: Number(p.measured) ? (Number(p.residual) / Math.abs(Number(p.measured))) * 100 : 0,
      }));
      set({
        comparison: stats(rows, points[0]?.quantity ?? "", points[0]?.unit ?? "",
                          json.benchRun.kind, "Reloaded from the stored validation points."),
        phase: "compared",
        source: json.benchRun.source,
        notes: json.benchRun.notes ?? "",
        savedId: id,
        fileName: `${json.benchRun.source} (stored)`,
        csv: "",
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  async removeImport(id) {
    await fetch(`/jobs/bench?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (get().savedId === id) set({ savedId: null, comparison: null, phase: "idle" });
    void get().refreshImports();
  },

  reset: () => set({ ...EMPTY }),
}));

/** The same statistics the solver reports, recomputed for stored points. */
function stats(
  rows: ResidualRow[], quantity: string, unit: string, kind: string, note: string,
): Comparison {
  const n = rows.length;
  const res = rows.map((r) => r.residual);
  const meas = rows.map((r) => r.measured);
  const bias = n ? res.reduce((a, b) => a + b, 0) / n : 0;
  const rms = n ? Math.sqrt(res.reduce((a, b) => a + b * b, 0) / n) : 0;
  const scale = n ? meas.reduce((a, b) => a + Math.abs(b), 0) / n : 0;
  const mean = n ? meas.reduce((a, b) => a + b, 0) / n : 0;
  const ssTot = meas.reduce((a, m) => a + (m - mean) ** 2, 0);
  const ssRes = res.reduce((a, r) => a + r * r, 0);
  return {
    quantity, label: quantity, unit, kind, n, rows,
    bias, rms,
    max_abs: n ? Math.max(...res.map(Math.abs)) : 0,
    bias_pct: scale ? (bias / scale) * 100 : 0,
    rms_pct: scale ? (rms / scale) * 100 : 0,
    r2: ssTot > 0 ? 1 - ssRes / ssTot : 0,
    skipped: [], note,
  };
}
