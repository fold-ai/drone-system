"use client";

import { useMemo, useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { css } from "@/lib/colormap";
import { fixed } from "@/lib/format";
import { useStudy } from "@/lib/studyStore";
import { type Band, type Cursor, StackedArea } from "./StackedArea";

const PARASITE = css(0.22);
const INDUCED = css(0.52);
const WAVE = css(0.92);

/**
 * Where the drag actually goes.
 *
 * Parasite, induced and wave stacked against Mach, in drag counts. It is first
 * on the page because it answers the question the rest of the page elaborates:
 * at this flight condition, which term is worth working on. The cursor reads all
 * three at once, in counts and as a share of the total, because a component is
 * only worth attacking if it is a large share of a large total.
 */
export function DragBreakdown() {
  const polar = useStudy((s) => s.polar);
  const spec = useStudy((s) => s.spec);
  const job = useStudy((s) => s.jobs.polar);
  const [cursor, setCursor] = useState<Cursor | null>(null);

  const data = useMemo(() => {
    if (!polar) return null;
    const x = polar.breakdown.map((p) => p.mach);
    const bands: Band[] = [
      {
        key: "cd0",
        label: "parasite",
        colour: PARASITE,
        values: polar.breakdown.map((p) => p.counts_cd0),
      },
      {
        key: "cdi",
        label: "induced",
        colour: INDUCED,
        values: polar.breakdown.map((p) => p.counts_cdi),
      },
      {
        key: "wave",
        label: "wave",
        colour: WAVE,
        values: polar.breakdown.map((p) => p.counts_wave),
      },
    ];
    return { x, bands };
  }, [polar]);

  if (!polar || !data) {
    return (
      <Panel title="Drag breakdown">
        <p className="p-3 text-[11px] text-dim">
          {job.phase === "running" ? "Solving." : job.error ?? "No result yet."}
        </p>
      </Panel>
    );
  }

  const idx = cursor?.index ?? nearest(data.x, spec.mission.target_mach);
  const p = polar.breakdown[idx];
  const total = p.cd_total * 1e4;

  return (
    <Panel
      title="Drag breakdown"
      right={
        <span className="num text-[10px] text-dim">
          {fixed(polar.altitude_m, 0)} m &middot; {fixed(polar.mass_kg, 2)} kg
        </span>
      }
    >
      <div className="p-2">
        <StackedArea
          x={data.x}
          bands={data.bands}
          height={236}
          xLabel="Mach"
          yLabel="drag counts"
          markers={[
            { x: spec.airframe.mach_dd, label: "M_dd", colour: WAVE },
            { x: spec.mission.target_mach, label: "cruise", colour: "#ffffff" },
          ]}
          onCursor={setCursor}
          pinnedIndex={nearest(data.x, spec.mission.target_mach)}
        />

        <div className="mt-2 grid grid-cols-4 gap-px bg-rule">
          <Cell label="Mach" value={fixed(p.mach, 3)} unit="" strong />
          <Cell
            label="parasite"
            value={fixed(p.counts_cd0, 1)}
            unit={`ct  ${fixed(p.frac_cd0 * 100, 0)}%`}
            colour={PARASITE}
          />
          <Cell
            label="induced"
            value={fixed(p.counts_cdi, 1)}
            unit={`ct  ${fixed(p.frac_cdi * 100, 0)}%`}
            colour={INDUCED}
          />
          <Cell
            label="wave"
            value={fixed(p.counts_wave, 1)}
            unit={`ct  ${fixed(p.frac_wave * 100, 0)}%`}
            colour={WAVE}
          />
        </div>

        <div className="mt-2 grid grid-cols-3 gap-px bg-rule">
          <Cell label="total CD" value={fixed(total, 1)} unit="counts" />
          <Cell label="CL" value={fixed(p.cl, 4)} unit="" />
          <Cell label="L/D" value={fixed(p.ld, 2)} unit="" />
        </div>

        <p className="mt-2 text-[10px] leading-snug text-dim">
          {polar.note} One drag count is 1e-4 of CD. Hover to move the cursor; it returns to the
          cruise Mach when the pointer leaves.
        </p>
      </div>
    </Panel>
  );
}

function nearest(xs: number[], v: number): number {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < xs.length; i += 1) {
    const d = Math.abs(xs[i] - v);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

function Cell({
  label,
  value,
  unit,
  colour,
  strong = false,
}: {
  label: string;
  value: string;
  unit: string;
  colour?: string;
  strong?: boolean;
}) {
  return (
    <div className="bg-panel px-2 py-1.5">
      <div className="flex items-center gap-1.5">
        {colour && <span className="inline-block h-2 w-2 shrink-0" style={{ background: colour }} />}
        <span className="truncate text-[10px] text-dim">{label}</span>
      </div>
      <div className={`num text-[13px] ${strong ? "text-bright" : "text-bright"}`}>
        {value}
        <span className="ml-1 text-[9px] text-dim">{unit}</span>
      </div>
    </div>
  );
}
