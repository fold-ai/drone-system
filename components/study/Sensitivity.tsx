"use client";

import { useEffect, useRef, useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { css } from "@/lib/colormap";
import { fixed, signed } from "@/lib/format";
import { useStudy } from "@/lib/studyStore";
import { STUDY_PARAMS } from "@/lib/types";

type Metric = "range" | "endurance" | "ld";

const METRIC_LABEL: Record<Metric, string> = {
  range: "range",
  endurance: "endurance",
  ld: "L/D max",
};

const LOW = css(0.28);
const HIGH = css(0.66);

const ALL_PATHS = Object.keys(STUDY_PARAMS);
const DEFAULT_PATHS = [
  "airframe.oswald_e",
  "airframe.cd0_sub",
  "airframe.mach_dd",
  "airframe.dcd_wave",
  "airframe.aspect_ratio",
  "airframe.cl_max",
  "airframe.mass_payload_kg",
];

/**
 * Which parameter is worth engineering effort.
 *
 * Each parameter is perturbed by a fixed percentage in both directions and the
 * design re-solved, then ordered by the size of the swing. The bar to the left
 * is the low perturbation and the bar to the right is the high one, so an
 * inverted pair means the parameter helps in the direction you would not guess.
 *
 * The whole set runs as one request rather than one per parameter, and results
 * are cached by the exact specification, so moving a slider does not fire
 * fifteen solves per keystroke. The cost is stated before it runs.
 */
export function Sensitivity() {
  const result = useStudy((s) => s.sensitivity);
  const job = useStudy((s) => s.jobs.sensitivity);
  const run = useStudy((s) => s.run);
  const spec = useStudy((s) => s.spec);
  const [metric, setMetric] = useState<Metric>("range");
  const [pert, setPert] = useState(0.1);
  const [paths, setPaths] = useState<string[]>(DEFAULT_PATHS);
  const [elapsed, setElapsed] = useState(0);
  const stale = useRef<string>("");

  const specKey = JSON.stringify(spec);
  const isStale = result !== null && stale.current !== "" && stale.current !== specKey;

  useEffect(() => {
    if (job.phase !== "running") return undefined;
    const t0 = Date.now();
    const id = window.setInterval(() => setElapsed((Date.now() - t0) / 1000), 100);
    return () => window.clearInterval(id);
  }, [job.phase]);

  const go = async () => {
    stale.current = specKey;
    await run("sensitivity", { paths, perturbation: pert });
  };

  const cost = paths.length * 2 + 1;

  return (
    <Panel
      title="Sensitivity"
      right={
        <div className="flex items-center gap-1.5">
          {(["range", "endurance", "ld"] as Metric[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMetric(m)}
              className={`hit h-5 border border-rule px-1.5 text-[10px] ${
                metric === m ? "bg-bright text-void" : "text-dim hover:text-bright"
              }`}
            >
              {METRIC_LABEL[m]}
            </button>
          ))}
        </div>
      }
    >
      <div className="p-2">
        <div className="flex flex-wrap items-center gap-2 pb-2">
          <span className="text-[10px] text-dim">perturbation</span>
          {[0.05, 0.1, 0.2].map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPert(p)}
              className={`hit h-5 border border-rule px-1.5 text-[10px] ${
                Math.abs(pert - p) < 1e-9 ? "bg-bright text-void" : "text-dim hover:text-bright"
              }`}
            >
              {(p * 100).toFixed(0)}%
            </button>
          ))}
          <span className="num text-[10px] text-dim">
            {paths.length} parameters, {cost} solves
          </span>
          <button
            type="button"
            onClick={() => void go()}
            disabled={job.phase === "running"}
            className="hit h-6 border border-bright px-2 text-[11px] text-bright hover:bg-bright hover:text-void disabled:opacity-40"
          >
            {job.phase === "running" ? `solving ${elapsed.toFixed(1)}s` : "run"}
          </button>
          {result && job.phase !== "running" && (
            <span className="num text-[10px] text-dim">
              {result.solves} solves in {fixed(result.solve_ms, 0)} ms
            </span>
          )}
          {isStale && (
            <span className="num text-[10px] text-alert">! specification changed since this run</span>
          )}
        </div>

        <details className="pb-2">
          <summary className="cursor-pointer text-[10px] text-dim hover:text-bright">
            parameters
          </summary>
          <div className="mt-1 flex flex-wrap gap-1">
            {ALL_PATHS.map((p) => {
              const on = paths.includes(p);
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() =>
                    setPaths(on ? paths.filter((q) => q !== p) : [...paths, p].slice(0, 12))
                  }
                  className={`hit h-5 border border-rule px-1.5 text-[10px] ${
                    on ? "bg-bright text-void" : "text-dim hover:text-bright"
                  }`}
                >
                  {(STUDY_PARAMS as Record<string, { label: string }>)[p].label}
                </button>
              );
            })}
          </div>
        </details>

        {job.error && <p className="pb-2 text-[11px] text-alert">! {job.error}</p>}

        {!result ? (
          <p className="text-[11px] text-dim">
            Nothing computed yet. {cost} solves, roughly {(cost * 0.02).toFixed(1)} s.
          </p>
        ) : (
          <Tornado metric={metric} />
        )}
      </div>
    </Panel>
  );
}

function Tornado({ metric }: { metric: Metric }) {
  const result = useStudy((s) => s.sensitivity);
  if (!result) return null;

  const pick = (r: (typeof result.rows)[number]) =>
    metric === "range"
      ? ([r.range_low_pct, r.range_high_pct] as const)
      : metric === "endurance"
        ? ([r.endurance_low_pct, r.endurance_high_pct] as const)
        : ([r.ld_low_pct, r.ld_high_pct] as const);

  const rows = [...result.rows].sort((a, b) => {
    const [al, ah] = pick(a);
    const [bl, bh] = pick(b);
    return Math.max(Math.abs(bl), Math.abs(bh)) - Math.max(Math.abs(al), Math.abs(ah));
  });
  const scale = Math.max(
    0.5,
    ...rows.flatMap((r) => pick(r).map((v) => Math.abs(v))),
  );

  const baseline =
    metric === "range"
      ? `${fixed(result.baseline_range_km, 1)} km`
      : metric === "endurance"
        ? `${fixed(result.baseline_endurance_s, 0)} s`
        : fixed(result.baseline_ld_max, 2);

  return (
    <div>
      <div className="flex items-baseline justify-between pb-1">
        <span className="text-[10px] text-dim">
          change in {METRIC_LABEL[metric]} for a {(result.perturbation * 100).toFixed(0)}%
          perturbation
        </span>
        <span className="num text-[10px] text-dim">baseline {baseline}</span>
      </div>

      {rows.map((r) => {
        const [lo, hi] = pick(r);
        return (
          <div key={r.path} className="flex items-center gap-2 py-[3px]">
            <span className="w-[150px] shrink-0 truncate text-right text-[10px] text-dim">
              {r.label}
            </span>
            <div className="relative h-4 min-w-0 flex-1 border border-rule bg-void">
              <div className="absolute inset-y-0 left-1/2 w-px bg-rule" />
              <Bar value={lo} scale={scale} colour={LOW} />
              <Bar value={hi} scale={scale} colour={HIGH} />
            </div>
            <span className="num w-[112px] shrink-0 text-right text-[10px]">
              <span style={{ color: LOW }}>{signed(lo, 1)}</span>
              <span className="text-dim"> / </span>
              <span style={{ color: HIGH }}>{signed(hi, 1)}</span>
              <span className="text-dim">%</span>
            </span>
          </div>
        );
      })}

      <div className="mt-2 flex items-center gap-3 text-[10px] text-dim">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2" style={{ background: LOW }} />
          minus {(result.perturbation * 100).toFixed(0)}%
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2" style={{ background: HIGH }} />
          plus {(result.perturbation * 100).toFixed(0)}%
        </span>
      </div>
      <p className="mt-1 text-[10px] leading-snug text-dim">{result.note}</p>
      {rows.some((r) => r.note) && (
        <p className="mt-1 text-[10px] leading-snug text-dim">
          {rows
            .filter((r) => r.note)
            .map((r) => `${r.label}: ${r.note}`)
            .join(". ")}
          .
        </p>
      )}
    </div>
  );
}

function Bar({ value, scale, colour }: { value: number; scale: number; colour: string }) {
  const frac = Math.min(1, Math.abs(value) / scale) * 50;
  if (frac < 0.15) return null;
  const positive = value >= 0;
  return (
    <div
      className="absolute inset-y-[2px]"
      style={{
        left: positive ? "50%" : `${50 - frac}%`,
        width: `${frac}%`,
        background: colour,
        opacity: 0.85,
      }}
    />
  );
}
