"use client";

import { fixed, pct } from "@/lib/format";
import { useSim } from "@/lib/store";

/**
 * Does the drawn aircraft match the aircraft the numbers describe?
 *
 * The drag polar is written against a reference area and a mean aerodynamic
 * chord. The viewport draws a planform that encloses whatever area its geometry
 * encloses. When the two disagree, every drag coefficient, every L/D and every
 * static margin on screen is quoted against a shape that is not the one being
 * shown, and nothing about the display says so. This panel says so.
 *
 * It does not reconcile them by itself. Adopting the drawn geometry changes the
 * aspect ratio and therefore the induced drag of the whole model, which is the
 * operator's call, not the interface's.
 */
export function GeometryCheck({ compact = false }: { compact?: boolean }) {
  const feas = useSim((s) => s.feas);
  const setField = useSim((s) => s.setField);
  const r = feas?.reconciliation;
  const p = feas?.planform;
  if (!r || !p) return null;

  if (compact) {
    return (
      <div
        className={`border px-2 py-1 text-[10px] ${
          r.consistent ? "border-rule text-dim" : "border-alert text-alert"
        }`}
        title={r.warnings.join("\n\n")}
      >
        <span className="num">{r.consistent ? "=" : "!"}</span>{" "}
        {r.consistent
          ? `planform ${fixed(r.drawn_area_m2, 3)} m2 matches the reference area`
          : `planform ${fixed(r.drawn_area_m2, 3)} m2 against a reference ${fixed(
              r.reference_area_m2,
              3,
            )} m2 (${pct(r.area_error, 0)}%)`}
      </div>
    );
  }

  return (
    <div className={`border ${r.consistent ? "border-rule" : "border-alert"}`}>
      <div className="flex items-baseline justify-between rule-b px-2 py-1">
        <span className="text-[10px] uppercase tracking-[0.1em] text-dim">
          Geometry against the polar
        </span>
        <span className={`num text-[10px] ${r.consistent ? "text-dim" : "text-alert"}`}>
          {r.consistent ? "consistent" : "! mismatch"}
        </span>
      </div>

      <table className="w-full text-[10px]">
        <thead>
          <tr className="text-dim">
            <th className="px-2 py-1 text-left font-normal">quantity</th>
            <th className="px-1 py-1 text-right font-normal">drawn</th>
            <th className="px-1 py-1 text-right font-normal">polar</th>
            <th className="px-2 py-1 text-right font-normal">error</th>
          </tr>
        </thead>
        <tbody className="num">
          <Row
            label="Reference area"
            unit="m2"
            drawn={r.drawn_area_m2}
            ref_={r.reference_area_m2}
            err={r.area_error}
            tol={r.tolerance}
            dp={3}
          />
          <Row
            label="Aspect ratio"
            unit=""
            drawn={r.drawn_aspect_ratio}
            ref_={r.reference_aspect_ratio}
            err={
              r.reference_aspect_ratio > 0
                ? (r.drawn_aspect_ratio - r.reference_aspect_ratio) / r.reference_aspect_ratio
                : 0
            }
            tol={r.tolerance}
            dp={2}
          />
          <Row
            label="Mean aero chord"
            unit="m"
            drawn={r.drawn_mac_m}
            ref_={r.reference_mac_m}
            err={r.mac_error}
            tol={r.tolerance}
            dp={3}
          />
          <Row
            label="L/D max"
            unit=""
            drawn={r.ld_max_drawn}
            ref_={r.ld_max_reference}
            err={
              r.ld_max_reference > 0
                ? (r.ld_max_drawn - r.ld_max_reference) / r.ld_max_reference
                : 0
            }
            tol={r.tolerance}
            dp={2}
          />
          <Row
            label="Span / length"
            unit=""
            drawn={r.span_length_ratio}
            ref_={r.cad_span_length_ratio}
            err={r.span_length_error}
            tol={0.05}
            dp={3}
            refLabel="CAD"
          />
        </tbody>
      </table>

      {r.warnings.length > 0 && (
        <div className="rule-t px-2 py-1.5">
          {r.warnings.map((w) => (
            <p key={w} className="mb-1 flex gap-1.5 text-[10px] leading-snug text-alert">
              <span className="num shrink-0">!</span>
              <span>{w}</span>
            </p>
          ))}
        </div>
      )}

      {!r.consistent && (
        <div className="rule-t px-2 py-1.5">
          <button
            type="button"
            onClick={() => {
              setField("airframe.wing_area_m2", Number(r.drawn_area_m2.toFixed(4)));
              setField("airframe.mac_m", Number(r.drawn_mac_m.toFixed(4)));
            }}
            className="hit w-full border border-rule px-2 py-1 text-[10px] text-dim hover:border-dim hover:text-bright"
          >
            adopt the drawn geometry as the reference
          </button>
          <p className="mt-1.5 text-[9px] leading-snug text-dim">
            This sets the reference area to {fixed(r.drawn_area_m2, 3)} m2 and the mean chord to{" "}
            {fixed(r.drawn_mac_m, 3)} m, which takes aspect ratio to{" "}
            {fixed(r.drawn_aspect_ratio, 2)} and L/D max to {fixed(r.ld_max_drawn, 2)}. It changes
            induced drag across the whole model. The alternative is that the reference area is
            right and the drawn proportions are wrong, in which case move span and length instead.
          </p>
        </div>
      )}

      <div className="rule-t px-2 py-1.5 text-[9px] leading-snug text-dim">
        Planform: root chord {fixed(p.root_chord_m, 3)} m, tip chord {fixed(p.tip_chord_m, 3)} m,
        taper {fixed(p.taper_ratio, 3)}, crank at {fixed(p.crank_y_m, 3)} m of{" "}
        {fixed(p.span_m / 2, 3)} m semispan.
      </div>
    </div>
  );
}

function Row({
  label,
  unit,
  drawn,
  ref_,
  err,
  tol,
  dp,
  refLabel,
}: {
  label: string;
  unit: string;
  drawn: number;
  ref_: number;
  err: number;
  tol: number;
  dp: number;
  refLabel?: string;
}) {
  const bad = Math.abs(err) > tol;
  return (
    <tr>
      <td className="px-2 py-0.5 font-sans text-dim">
        {label}
        {refLabel && <span className="ml-1 text-[9px]">({refLabel})</span>}
      </td>
      <td className="px-1 py-0.5 text-right text-bright">{fixed(drawn, dp)}</td>
      <td className="px-1 py-0.5 text-right text-dim">{fixed(ref_, dp)}</td>
      <td className={`px-2 py-0.5 text-right ${bad ? "text-alert" : "text-dim"}`}>
        {bad ? "! " : ""}
        {pct(err, 0)}%<span className="ml-1 text-dim">{unit}</span>
      </td>
    </tr>
  );
}
