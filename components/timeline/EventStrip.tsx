"use client";

import { clock } from "@/lib/format";
import { useSim } from "@/lib/store";
import type { FlightEvent } from "@/lib/types";

/**
 * Flight events as a strip under the scrubber.
 *
 * Each event gets a glyph for its kind so the sequence reads at a glance, and
 * clicking one seeks to it. Severity adds colour on top of the glyph, never
 * instead of it.
 */

function Glyph({ kind }: { kind: string }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.3 };
  switch (kind) {
    case "release":
      return (
        <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden>
          <path d="M6 1 L10 10 L6 8 L2 10 Z" {...common} />
        </svg>
      );
    case "rail_exit":
      return (
        <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden>
          <path d="M1 10 L10 2 M10 2 L6 2 M10 2 L10 6" {...common} />
        </svg>
      );
    case "booster_burnout":
    case "booster_jettison":
      return (
        <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden>
          <path d="M2 3 L6 7 L10 3 M2 7 L6 11 L10 7" {...common} />
        </svg>
      );
    case "top_of_climb":
      return (
        <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden>
          <path d="M1 9 L4 3 L8 3 L11 9 M4 3 L8 3" {...common} />
        </svg>
      );
    case "mach_dd_cross":
      return (
        <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden>
          <path d="M1 8 Q3 3 5.5 6 T10 4" {...common} />
        </svg>
      );
    case "stall_onset":
      return (
        <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden>
          <path d="M2 2 L10 10 M10 2 L2 10" {...common} />
        </svg>
      );
    case "lift_limited":
      return (
        <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden>
          <path d="M2 8 L10 8 M6 8 L6 3 M3.5 5.5 L6 3 L8.5 5.5" {...common} />
        </svg>
      );
    case "flameout":
      return (
        <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden>
          <circle cx="6" cy="6" r="4.2" {...common} />
          <path d="M3 9 L9 3" {...common} />
        </svg>
      );
    case "target_range":
      return (
        <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden>
          <circle cx="6" cy="6" r="4.2" {...common} />
          <circle cx="6" cy="6" r="1.3" {...common} />
        </svg>
      );
    case "ground_impact":
      return (
        <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden>
          <path d="M1 10 L11 10 M3 8 L6 2 L9 8" {...common} />
        </svg>
      );
    case "cg_limit":
      return (
        <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden>
          <path d="M6 2 L6 9 M2 9 L10 9 M3 5 L9 5" {...common} />
        </svg>
      );
    default:
      return (
        <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden>
          <path d="M6 2 L6 10" {...common} />
        </svg>
      );
  }
}

export function EventStrip() {
  const run = useSim((s) => s.run);
  const setT = useSim((s) => s.setT);
  if (!run || run.events.length === 0) return null;

  return (
    <div className="flex h-7 shrink-0 items-center gap-1 overflow-x-auto rule-t bg-panel px-3">
      <span className="tracked shrink-0 pr-1 text-[9px] text-dim">events</span>
      {run.events.map((e: FlightEvent, i) => (
        <button
          key={`${e.kind}-${i}`}
          type="button"
          onClick={() => setT(e.t)}
          title={`${clock(e.t)}  ${e.label}${e.detail ? `\n${e.detail}` : ""}`}
          className={`hit flex h-5 shrink-0 items-center gap-1 border border-rule px-1.5 text-[10px] ${
            e.severity === "alert"
              ? "text-alert hover:border-alert"
              : e.severity === "warn"
                ? "text-bright hover:border-dim"
                : "text-dim hover:border-dim hover:text-bright"
          }`}
        >
          <Glyph kind={e.kind} />
          <span className="num">{clock(e.t)}</span>
          <span className="max-w-[130px] truncate">{e.label}</span>
        </button>
      ))}
    </div>
  );
}
