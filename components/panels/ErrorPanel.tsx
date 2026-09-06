"use client";

import { tabForPath } from "@/lib/diagnostics";
import { useSim } from "@/lib/store";
import { FIELD_META } from "@/lib/types";

/**
 * Solver failure, presented rather than dumped.
 *
 * A raw string in a red strip tells the operator something broke and nothing
 * about what to do. When the message names a field the panel offers a jump
 * straight to it; when it does not, it still offers the two moves that
 * generally help, retrying and returning to the defaults.
 */
export function ErrorPanel() {
  const error = useSim((s) => s.error);
  const detail = useSim((s) => s.errorDetail);
  const run_ = useSim((s) => s.run_);
  const resetSpec = useSim((s) => s.resetSpec);
  const focusOn = useSim((s) => s.focusOn);
  const setConfigTab = useSim((s) => s.setConfigTab);
  if (!error) return null;

  const haystack = `${error} ${detail}`;
  const named = Object.keys(FIELD_META).filter((p) => {
    const leaf = p.split(".").pop() as string;
    return haystack.includes(p) || new RegExp(`\\b${leaf}\\b`).test(haystack);
  });

  return (
    <div className="shrink-0 rule-b bg-panel">
      <div className="flex items-start gap-3 border-l-2 border-alert px-3 py-2">
        <span className="num shrink-0 pt-px text-[12px] text-alert">!</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="tracked text-[10px] text-alert">Solver</span>
            <span className="text-[11px] text-alert">{error}</span>
          </div>
          {named.length > 0 && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] text-dim">fields named in the failure</span>
              {named.slice(0, 6).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    setConfigTab(tabForPath(p));
                    focusOn(p);
                  }}
                  className="hit border border-rule px-1.5 text-[10px] text-dim hover:border-dim hover:text-bright"
                >
                  {FIELD_META[p].label}
                </button>
              ))}
            </div>
          )}
          {detail && (
            <details className="mt-1.5">
              <summary className="cursor-pointer text-[10px] text-dim hover:text-bright">
                traceback
              </summary>
              <pre className="num mt-1 max-h-32 overflow-auto whitespace-pre-wrap text-[10px] text-dim">
                {detail}
              </pre>
            </details>
          )}
        </div>
        <div className="flex shrink-0 gap-1.5">
          <button
            type="button"
            onClick={() => void run_()}
            className="hit h-6 border border-rule px-2 text-[11px] text-dim hover:border-dim hover:text-bright"
          >
            retry
          </button>
          <button
            type="button"
            onClick={resetSpec}
            className="hit h-6 border border-rule px-2 text-[11px] text-dim hover:border-dim hover:text-bright"
          >
            defaults
          </button>
        </div>
      </div>
    </div>
  );
}

/** Shown in the viewport and chart areas before the first solve. */
export function EmptyState({ where }: { where: "viewport" | "charts" | "aero" }) {
  const status = useSim((s) => s.status);
  const run_ = useSim((s) => s.run_);
  const feas = useSim((s) => s.feas);

  const copy =
    where === "viewport"
      ? "No trajectory yet."
      : where === "charts"
        ? "No trajectory yet."
        : "No trajectory yet.";

  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
      <p className="text-[11px] text-dim">{copy}</p>
      {feas && (
        <p className="num text-[10px] text-dim">
          sized for {feas.fuel.requested_range_km.toFixed(0)} km on{" "}
          {feas.fuel.fuel_required_kg.toFixed(2)} kg
        </p>
      )}
      {status !== "solving" && (
        <button
          type="button"
          onClick={() => void run_()}
          className="hit h-6 border border-bright px-3 text-[11px] text-bright hover:bg-bright hover:text-void"
        >
          run the mission
        </button>
      )}
    </div>
  );
}
