"use client";

import { Panel } from "@/components/ui/Panel";
import { fixed } from "@/lib/format";
import { useOptimise } from "@/lib/optimiseStore";

const PHASE_LABEL: Record<string, string> = {
  idle: "not started",
  starting: "starting",
  running: "searching",
  paused: "paused",
  done: "finished",
  failed: "failed",
  cancelled: "cancelled",
};

/**
 * Search progress: how far it has gone, how much of it was admissible, and how
 * the best objective moved. The feasible count matters more than the total. A
 * search that evaluated two thousand designs and found four that satisfy the
 * constraints has told you about the constraints, not the design.
 */
export function Progress() {
  const s = useOptimise();
  const pct = s.target > 0 ? Math.min(1, s.nEvals / s.target) : 0;
  const feasiblePct = s.nEvals > 0 ? s.nFeasible / s.nEvals : 0;
  const best = s.best?.evaluation;

  return (
    <Panel
      title="PROGRESS"
      right={
        <span
          className={`text-[10px] ${
            s.phase === "failed" ? "text-alert" : s.phase === "running" ? "text-bright" : "text-dim"
          }`}
        >
          {PHASE_LABEL[s.phase] ?? s.phase}
        </span>
      }
    >
      <div className="flex flex-col gap-2 p-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="num text-[18px] text-bright">{s.nEvals}</span>
          <span className="text-[10px] text-dim">of {s.target} evaluations</span>
        </div>
        <div className="h-1 w-full bg-void" aria-hidden>
          <div className="h-full bg-bright" style={{ width: `${pct * 100}%` }} />
        </div>

        <div className="flex items-baseline justify-between gap-2 pt-1">
          <span className="text-[11px] text-dim">Feasible</span>
          <span className="flex items-baseline gap-1.5">
            <span
              className={`num text-[12px] ${
                s.nEvals > 0 && feasiblePct < 0.02 ? "text-alert" : "text-bright"
              }`}
            >
              {s.nFeasible}
            </span>
            <span className="num text-[10px] text-dim">{fixed(feasiblePct * 100, 1)}%</span>
          </span>
        </div>
        {s.nEvals > 200 && feasiblePct < 0.02 && (
          <p className="text-[10px] leading-snug text-alert">
            Almost nothing satisfies the constraints. The result describes the constraint set
            more than the aircraft. Loosen one and run it again before reading the design.
          </p>
        )}

        <div className="flex items-baseline justify-between gap-2 pt-1 rule-t">
          <span className="pt-2 text-[11px] text-dim">Best objective</span>
          <span className="num pt-2 text-[13px] text-bright">
            {best ? fixed(best.objective, 2) : "-"}
          </span>
        </div>
        {best && !best.feasible && (
          <p className="text-[10px] leading-snug text-alert">
            The best vector so far violates {(best.violations ?? []).join(", ") || "a constraint"}.
            Its objective is the penalised value, not a design you can build.
          </p>
        )}

        {s.history.length > 1 && <Trace />}
      </div>
    </Panel>
  );
}

/** Best-so-far against evaluations. Monotone by construction, so it only ever shows where it stalled. */
function Trace() {
  const history = useOptimise((s) => s.history);
  const w = 240;
  const h = 44;
  const xs = history.map((p) => p.evals);
  const ys = history.map((p) => p.objective);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const sx = (v: number) => (x1 === x0 ? 0 : ((v - x0) / (x1 - x0)) * w);
  const sy = (v: number) => (y1 === y0 ? h / 2 : h - ((v - y0) / (y1 - y0)) * h);
  const d = history.map((p, i) => `${i ? "L" : "M"}${sx(p.evals).toFixed(1)} ${sy(p.objective).toFixed(1)}`).join(" ");

  return (
    <div className="pt-2">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-11 w-full" preserveAspectRatio="none" aria-hidden>
        <path d={d} fill="none" stroke="currentColor" strokeWidth="1" className="text-bright" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex justify-between text-[9px] text-dim">
        <span className="num">{fixed(y0, 1)}</span>
        <span>best so far</span>
        <span className="num">{fixed(y1, 1)}</span>
      </div>
    </div>
  );
}
