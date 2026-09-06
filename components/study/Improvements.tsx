"use client";

import { Panel } from "@/components/ui/Panel";
import { css } from "@/lib/colormap";
import { fixed } from "@/lib/format";
import { useStudy } from "@/lib/studyStore";

/**
 * What to change, ranked by range gained per unit of the perturbation.
 *
 * Derived from the sensitivity results rather than written down: whichever
 * direction of each parameter improves range is the one offered, and the
 * assumption it rests on is stated with it. A suggestion without its assumption
 * is a guess dressed as advice, so every row carries one.
 */
export function Improvements() {
  const result = useStudy((s) => s.sensitivity);

  if (!result) {
    return (
      <Panel title="Improvements">
        <p className="p-3 text-[11px] text-dim">
          Run the sensitivity analysis. These are derived from it, not written down.
        </p>
      </Panel>
    );
  }

  if (result.improvements.length === 0) {
    return (
      <Panel title="Improvements">
        <p className="p-3 text-[11px] text-dim">
          No parameter in this set improves range by more than a rounding error at a{" "}
          {(result.perturbation * 100).toFixed(0)}% perturbation. Widen the perturbation or add
          parameters.
        </p>
      </Panel>
    );
  }

  const top = result.improvements[0].range_gain_pct || 1;

  return (
    <Panel
      title="Improvements"
      right={
        <span className="num text-[10px] text-dim">
          ranked by range per {(result.perturbation * 100).toFixed(0)}%
        </span>
      }
      scroll
    >
      <div className="p-2">
        {result.improvements.map((im, i) => (
          <div key={im.path} className="mb-2 border border-rule">
            <div className="flex items-baseline justify-between gap-2 rule-b px-2 py-1">
              <span className="num text-[10px] text-dim">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-[11px] text-bright">{im.label}</span>
              <span className="num shrink-0 text-[12px]" style={{ color: css(0.62) }}>
                +{fixed(im.range_gain_pct, 1)}%
              </span>
            </div>
            <div className="px-2 py-1.5">
              <div className="num text-[11px] text-bright">
                {fixed(im.from_value, precision(im.from_value))} &rarr;{" "}
                {fixed(im.to_value, precision(im.to_value))}
                {im.unit && <span className="ml-1 text-[9px] text-dim">{im.unit}</span>}
              </div>
              <div className="mt-1 h-1 w-full bg-void">
                <div
                  className="h-full"
                  style={{
                    width: `${Math.max(2, (im.range_gain_pct / top) * 100)}%`,
                    background: css(0.62),
                  }}
                />
              </div>
              <p className="mt-1.5 text-[10px] leading-snug text-dim">
                <span className="text-bright">costs</span> {im.cost}
              </p>
              <p className="mt-0.5 text-[10px] leading-snug text-dim">
                <span className="text-bright">assumes</span> {im.assumption}
              </p>
            </div>
          </div>
        ))}
        {(() => {
          // Parameters that were tried and did nothing are worth naming: an
          // absent row otherwise looks like an oversight rather than a result.
          const offered = new Set(result.improvements.map((i) => i.path));
          const inert = result.rows.filter((r) => !offered.has(r.path));
          if (inert.length === 0) return null;
          return (
            <p className="mb-2 text-[10px] leading-snug text-dim">
              <span className="text-bright">no measurable effect</span>{" "}
              {inert.map((r) => r.label.toLowerCase()).join(", ")}. Each moves range by under
              0.1% at this perturbation, so there is nothing to be gained by working on{" "}
              {inert.length > 1 ? "them" : "it"} at this design point.
            </p>
          );
        })()}
        <p className="text-[10px] leading-snug text-dim">
          Every figure is the change in maximum range on a full tank from re-solving the design
          with that one parameter moved. Gains do not add: move two and re-run.
        </p>
      </div>
    </Panel>
  );
}

function precision(v: number): number {
  const a = Math.abs(v);
  if (a >= 100) return 0;
  if (a >= 1) return 2;
  if (a >= 0.01) return 4;
  return 5;
}
