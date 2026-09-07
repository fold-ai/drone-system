"use client";

import { Panel, SubHead } from "@/components/ui/Panel";
import { Readout } from "@/components/ui/Readout";
import { fixed } from "@/lib/format";
import { useOptimise } from "@/lib/optimiseStore";

/** Within 1% of an end of the range is the box holding it there, not the physics. */
function atBound(v: number, lo: number, hi: number): "lo" | "hi" | null {
  const tol = Math.max((hi - lo) * 0.01, 1e-9);
  if (v <= lo + tol) return "lo";
  if (v >= hi - tol) return "hi";
  return null;
}

/**
 * The best design found, with each variable shown against the range it was
 * allowed to move in.
 *
 * A variable pinned at an end of its range is reported plainly. It means the
 * optimum is outside the box and the number is a statement about the bound, not
 * about the aeroplane. Left unmarked, a bounds-limited result reads as a
 * converged one.
 */
export function BestDesign() {
  const best = useOptimise((s) => s.best);
  const variables = useOptimise((s) => s.variables);
  const ev = best?.evaluation;

  if (!best || !variables.length) {
    return (
      <Panel title="BEST DESIGN">
        <p className="p-3 text-[11px] text-dim">Nothing evaluated yet.</p>
      </Panel>
    );
  }

  const rows = variables.map((v) => {
    const value = best.values[v.key];
    return { ...v, value, bound: atBound(value, v.lo, v.hi) };
  });
  const pinned = rows.filter((r) => r.bound);

  return (
    <Panel
      title="BEST DESIGN"
      scroll
      right={
        <span className={`text-[10px] ${ev?.feasible ? "text-dim" : "text-alert"}`}>
          {ev?.feasible ? "feasible" : "infeasible"}
        </span>
      }
    >
      <div className="flex flex-col gap-1 p-3">
        <Readout label="Range" value={ev?.range_km} unit="km" decimals={1} />
        <Readout label="Endurance" value={ev?.endurance_s} unit="s" decimals={0} />
        <Readout label="Peak L/D" value={ev?.ld_max} decimals={2} />
        <Readout label="Max level Mach" value={ev?.max_level_mach} decimals={3} />
        <Readout label="Rail exit margin" value={ev?.exit_margin} decimals={2} />
        <Readout
          label="Static margin, least"
          value={ev?.min_static_margin === undefined ? undefined : ev.min_static_margin * 100}
          unit="% MAC"
          decimals={1}
        />
      </div>

      {pinned.length > 0 && (
        <div className="mx-3 mb-2 border border-alert px-2 py-1.5">
          <p className="text-[10px] leading-snug text-alert">
            {pinned.length} of {rows.length} variables sat at a bound
            {pinned.length > rows.length / 2 ? ", so the search is describing the bounds" : ""}.
            Widen the range on {pinned.slice(0, 3).map((p) => p.label.toLowerCase()).join(", ")}
            {pinned.length > 3 ? " and others" : ""} to find out whether the optimum is inside it.
          </p>
        </div>
      )}

      <SubHead>Design vector</SubHead>
      <div className="flex flex-col gap-1.5 px-3 pb-3">
        {rows.map((r) => (
          <div key={r.key} title={r.note || undefined}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-[11px] text-dim">{r.label}</span>
              <span className="flex shrink-0 items-baseline gap-1">
                <span className={`num text-[12px] ${r.bound ? "text-alert" : "text-bright"}`}>
                  {fixed(r.value, r.value >= 100 ? 0 : 3)}
                </span>
                <span className="w-8 shrink-0 text-[10px] text-dim">{r.unit}</span>
              </span>
            </div>
            <Track lo={r.lo} hi={r.hi} value={r.value} bound={r.bound} />
          </div>
        ))}
      </div>
    </Panel>
  );
}

/** The allowed range with the chosen value on it. Ends are drawn so a pin is visible. */
function Track({
  lo, hi, value, bound,
}: { lo: number; hi: number; value: number; bound: "lo" | "hi" | null }) {
  const t = hi === lo ? 0.5 : (value - lo) / (hi - lo);
  return (
    <div className="mt-0.5 flex items-center gap-1.5">
      <span className="num w-10 shrink-0 text-right text-[9px] text-dim">{fixed(lo, 2)}</span>
      <span className="relative h-2 min-w-0 flex-1 border-y-0 border-x border-rule">
        <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-rule" />
        <span
          className={`absolute top-0 h-2 w-px ${bound ? "bg-alert" : "bg-bright"}`}
          style={{ left: `${Math.max(0, Math.min(1, t)) * 100}%` }}
        />
      </span>
      <span className="num w-10 shrink-0 text-[9px] text-dim">{fixed(hi, 2)}</span>
    </div>
  );
}
