"use client";

import { deriveGeometry } from "@/lib/planform-measured.mjs";
import { fixed } from "@/lib/format";
import { useSim } from "@/lib/store";

/**
 * The assumed scale, stated in the header.
 *
 * The plan-view render carries no dimensions, so the absolute size of the
 * aircraft is unknown. Overall length is the single dimensional input and span,
 * area and mean chord are measured ratios of it. That is a large assumption
 * sitting under every number on the screen, so it is stated where it cannot be
 * missed rather than buried in a parameter drawer.
 */
export function ScaleBadge({ lengthM }: { lengthM?: number }) {
  const specLength = useSim((s) => s.spec.airframe.length_m);
  const L = lengthM ?? specLength;
  const g = deriveGeometry(L);

  return (
    <span
      className="flex items-center gap-2 border border-rule px-2 py-0.5"
      title={
        "The CAD render is dimensionless. Overall length is assumed; span, reference area " +
        "and mean aerodynamic chord are ratios measured off the plan view (b/L 0.722, " +
        "S/L2 0.368, MAC/L 0.591). None of these are CAD dimensions."
      }
    >
      <span className="text-[9px] uppercase tracking-[0.1em] text-dim">assumed length</span>
      <span className="num text-[12px] text-bright">{fixed(L, 2)}</span>
      <span className="text-[9px] text-dim">m</span>
      <span className="num text-[10px] text-dim">
        &rarr; b {fixed(g.spanM, 2)} m &middot; S {fixed(g.areaM2, 2)} m2 &middot; AR{" "}
        {fixed(g.aspectRatio, 2)}
      </span>
    </span>
  );
}
