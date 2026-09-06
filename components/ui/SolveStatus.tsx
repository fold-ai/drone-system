"use client";

import { useEffect, useRef } from "react";
import { fixed } from "@/lib/format";
import { useSim } from "@/lib/store";

/**
 * Run control and solve feedback.
 *
 * How long the last solve took is not trivia: it is how the operator knows
 * whether a throttle change will feel live or cost a wait. The button carries
 * elapsed time while solving, and the last three round trips sit beside it as a
 * sparkline with the newest bar filled.
 */
export function RunButton() {
  const status = useSim((s) => s.status);
  const run_ = useSim((s) => s.run_);
  const solving = status === "solving";
  const elapsed = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!solving) return undefined;
    const id = window.setInterval(() => {
      const started = useSim.getState().solveStartedAt;
      if (elapsed.current && started) {
        elapsed.current.textContent = `${((Date.now() - started) / 1000).toFixed(1)}s`;
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [solving]);

  return (
    <button
      type="button"
      onClick={() => void run_()}
      disabled={solving}
      title="Solve the whole mission"
      className={`hit relative flex h-6 w-[86px] items-center justify-center overflow-hidden border px-2 text-[11px] ${
        solving
          ? "border-dim text-dim"
          : "border-bright bg-void text-bright hover:bg-bright hover:text-void"
      }`}
    >
      {solving && (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-full origin-left bg-bright/12"
          style={{ animation: "act1-solve 1.1s ease-in-out infinite" }}
        />
      )}
      <span className="relative flex items-baseline gap-1.5">
        {solving ? "solving" : "run"}
        {solving && (
          <span ref={elapsed} className="num text-[10px]">
            0.0s
          </span>
        )}
      </span>
    </button>
  );
}

/** Last three round trips. Newest is filled; the rest are outlines. */
export function RoundTripSparkline() {
  const trips = useSim((s) => s.roundTrips);
  const splice = useSim((s) => s.spliceStatus);
  if (trips.length === 0) return null;
  const max = Math.max(...trips, 1);

  return (
    <div
      className="flex items-end gap-1"
      title={`Round trips, oldest to newest: ${trips.map((t) => `${Math.round(t)} ms`).join(", ")}`}
    >
      <span className="text-[9px] uppercase tracking-[0.1em] text-dim">rtt</span>
      <div className="flex h-4 items-end gap-[2px]">
        {trips.map((t, i) => (
          <div
            key={`${i}-${t}`}
            className={`w-[5px] ${i === trips.length - 1 ? "bg-bright" : "border border-dim"}`}
            style={{ height: `${Math.max(2, (t / max) * 16)}px` }}
          />
        ))}
      </div>
      <span className="num w-[52px] text-right text-[10px] text-dim">
        {splice === "solving" ? "re-solve" : `${fixed(trips[trips.length - 1], 0)} ms`}
      </span>
    </div>
  );
}
