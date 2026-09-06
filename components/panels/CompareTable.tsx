"use client";

import { fixed, signed } from "@/lib/format";
import type { Run } from "@/lib/playback";
import { useSim } from "@/lib/store";

interface Row {
  label: string;
  unit: string;
  dp: number;
  of: (r: Run) => number;
  /** Which direction is an improvement, for the arrow glyph. Null = neutral. */
  better?: "up" | "down" | null;
}

const ROWS: Row[] = [
  { label: "Ground range", unit: "km", dp: 2, of: (r) => r.summary.ground_range_km, better: "up" },
  { label: "Fuel loaded", unit: "kg", dp: 3, of: (r) => r.summary.fuel_loaded_kg, better: "down" },
  { label: "Fuel remaining", unit: "kg", dp: 3, of: (r) => r.summary.fuel_remaining_kg, better: "up" },
  { label: "Gross mass", unit: "kg", dp: 2, of: (r) => r.summary.gross_mass_kg, better: "down" },
  { label: "Max Mach", unit: "M", dp: 4, of: (r) => r.summary.max_mach, better: "up" },
  { label: "Max altitude", unit: "m", dp: 0, of: (r) => r.summary.max_altitude_m, better: null },
  { label: "Rail exit", unit: "m/s", dp: 1, of: (r) => r.launch.v_exit_ms, better: "up" },
  { label: "Exit margin", unit: "x Vs", dp: 2, of: (r) => r.launch.margin_ratio, better: "up" },
  { label: "Top of climb", unit: "s", dp: 1, of: (r) => r.summary.time_to_cruise_s, better: "down" },
  { label: "Max q", unit: "kPa", dp: 2, of: (r) => r.summary.max_q_pa / 1000, better: null },
  { label: "Best L/D seen", unit: "", dp: 2, of: (r) => r.summary.best_ld, better: "up" },
  { label: "Min static margin", unit: "% MAC", dp: 2, of: (r) => r.summary.min_static_margin * 100, better: "up" },
  { label: "Endurance", unit: "s", dp: 1, of: (r) => r.summary.endurance_s, better: "up" },
];

/**
 * A/B against the held reference.
 *
 * The charts already overlay the two runs; this is the numeric half. The arrow
 * says which way a difference went, and it is a glyph rather than a colour so
 * the table reads without hue. Rows where a direction is meaningless carry no
 * arrow at all rather than an arbitrary one.
 */
export function CompareTable() {
  const run = useSim((s) => s.run);
  const ghost = useSim((s) => s.ghost);
  if (!run || !ghost) return null;

  return (
    <div className="border border-rule">
      <div className="flex items-baseline justify-between rule-b px-2 py-1">
        <span className="text-[10px] uppercase tracking-[0.1em] text-dim">
          Against reference
        </span>
        <span className="num text-[9px] text-dim">{ghost.label}</span>
      </div>
      <table className="w-full text-[10px]">
        <thead>
          <tr className="text-dim">
            <th className="px-2 py-1 text-left font-normal">quantity</th>
            <th className="px-1 py-1 text-right font-normal">current</th>
            <th className="px-1 py-1 text-right font-normal">ref</th>
            <th className="px-2 py-1 text-right font-normal">delta</th>
          </tr>
        </thead>
        <tbody className="num">
          {ROWS.map((row) => {
            const a = row.of(run);
            const b = row.of(ghost);
            const d = a - b;
            const meaningful = Number.isFinite(d) && Math.abs(d) > 10 ** -row.dp / 2;
            const improved =
              row.better && meaningful ? (row.better === "up" ? d > 0 : d < 0) : null;
            return (
              <tr key={row.label} className={meaningful ? "" : "text-dim"}>
                <td className="px-2 py-0.5 font-sans">{row.label}</td>
                <td className="px-1 py-0.5 text-right text-bright">{fixed(a, row.dp)}</td>
                <td className="px-1 py-0.5 text-right text-dim">{fixed(b, row.dp)}</td>
                <td className="px-2 py-0.5 text-right">
                  {meaningful ? (
                    <span className={improved === null ? "" : improved ? "text-bright" : "text-alert"}>
                      {improved === null ? "" : improved ? "^ " : "v "}
                      {signed(d, row.dp)}
                    </span>
                  ) : (
                    "--"
                  )}
                  <span className="ml-1 text-dim">{row.unit}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
