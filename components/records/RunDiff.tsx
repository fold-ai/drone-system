"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Panel, SubHead } from "@/components/ui/Panel";
import { fixed } from "@/lib/format";
import { fetchRun, useRecords, type LoadedRun } from "@/lib/recordsStore";

/**
 * Two records side by side.
 *
 * The comparison is only honest when both runs came from the same solver. When
 * they did not, that is said at the top rather than left for the reader to spot
 * in the version column, because the geometry rebuild moved every number the
 * project had produced and a diff across that boundary is meaningless.
 */
const METRICS: { key: string; label: string; unit: string; decimals: number; higherIsBetter?: boolean }[] = [
  { key: "range_km", label: "Range", unit: "km", decimals: 2, higherIsBetter: true },
  { key: "endurance_s", label: "Endurance", unit: "s", decimals: 0, higherIsBetter: true },
  { key: "ld_max", label: "Peak L/D", unit: "", decimals: 3, higherIsBetter: true },
  { key: "max_mach", label: "Max Mach", unit: "M", decimals: 4 },
  { key: "fuel_burn_kg", label: "Fuel burned", unit: "kg", decimals: 3 },
  { key: "v_rail_exit_ms", label: "Rail exit speed", unit: "m/s", decimals: 2, higherIsBetter: true },
  { key: "max_load_factor", label: "Peak load factor", unit: "g", decimals: 2 },
  { key: "max_altitude_m", label: "Peak altitude", unit: "m", decimals: 0 },
  { key: "max_q_pa", label: "Peak dynamic pressure", unit: "Pa", decimals: 0 },
  { key: "min_static_margin", label: "Least static margin", unit: "", decimals: 4, higherIsBetter: true },
];

const SPEC_FIELDS: { path: string; label: string; unit: string; decimals: number }[] = [
  { path: "airframe.length_m", label: "Overall length", unit: "m", decimals: 3 },
  { path: "airframe.cd0_sub", label: "Parasite drag CD0", unit: "", decimals: 4 },
  { path: "airframe.oswald_e", label: "Oswald efficiency", unit: "", decimals: 3 },
  { path: "airframe.mach_dd", label: "Drag divergence Mach", unit: "M", decimals: 3 },
  { path: "airframe.mass_payload_kg", label: "Payload", unit: "kg", decimals: 3 },
  { path: "airframe.fuel_capacity_kg", label: "Tank capacity", unit: "kg", decimals: 3 },
  { path: "launch.rail_length_m", label: "Rail length", unit: "m", decimals: 3 },
  { path: "launch.rail_angle_deg", label: "Rail angle", unit: "deg", decimals: 2 },
  { path: "mission.cruise_altitude_m", label: "Cruise altitude", unit: "m", decimals: 0 },
  { path: "mission.target_range_km", label: "Target range", unit: "km", decimals: 2 },
];

function at(obj: unknown, path: string): number | null {
  let node: unknown = obj;
  for (const key of path.split(".")) {
    if (!node || typeof node !== "object") return null;
    node = (node as Record<string, unknown>)[key];
  }
  return typeof node === "number" ? node : null;
}

export function RunDiff() {
  const selected = useRecords((s) => s.selected);
  const clearSelection = useRecords((s) => s.clearSelection);
  const [pair, setPair] = useState<(LoadedRun | null)[]>([null, null]);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setError("");
    Promise.all(selected.map((id) => fetchRun(id).catch(() => null)))
      .then((rows) => alive && setPair([rows[0] ?? null, rows[1] ?? null]))
      .catch((err) => alive && setError(String(err)));
    return () => {
      alive = false;
    };
  }, [selected]);

  if (selected.length === 0) {
    return (
      <Panel title="COMPARISON">
        <p className="p-3 text-[11px] leading-snug text-dim">
          Tick two runs to compare them. The first is A, the second is B, and the difference is
          read B minus A.
        </p>
      </Panel>
    );
  }

  const [a, b] = pair;
  const versionA = String(a?.summary?.solver_version ?? "");
  const versionB = String(b?.summary?.solver_version ?? "");
  const mixed = Boolean(a && b && versionA !== versionB);

  return (
    <Panel
      title="COMPARISON"
      scroll
      right={
        <Button variant="ghost" onClick={clearSelection}>
          clear
        </Button>
      }
    >
      {error && <p className="px-3 pt-2 text-[11px] text-alert">{error}</p>}

      <div className="grid grid-cols-[1fr_auto] gap-2 px-3 pt-2">
        <div className="min-w-0">
          <div className="text-[9px] uppercase tracking-[0.1em] text-dim">A</div>
          <div className="truncate text-[11px] text-bright">{a?.name ?? "loading"}</div>
          <div className="num truncate text-[9px] text-dim">{versionA}</div>
        </div>
      </div>
      {b && (
        <div className="grid grid-cols-[1fr_auto] gap-2 px-3 pt-2">
          <div className="min-w-0">
            <div className="text-[9px] uppercase tracking-[0.1em] text-dim">B</div>
            <div className="truncate text-[11px] text-bright">{b.name}</div>
            <div className="num truncate text-[9px] text-dim">{versionB}</div>
          </div>
        </div>
      )}

      {mixed && (
        <div className="mx-3 mt-2 border border-alert px-2 py-1.5">
          <p className="text-[10px] leading-snug text-alert">
            These two ran on different solvers, {versionA} and {versionB}. The planform rebuild
            changed the reference area, the span and the induced-drag factor, so the difference
            below is partly the aircraft and partly the solver. Re-solve the older
            specification before reading anything into it.
          </p>
        </div>
      )}

      {b && (
        <>
          <SubHead right={<span className="text-[9px] text-dim">B minus A</span>}>Results</SubHead>
          <Rows source="summary" a={a} b={b} fields={METRICS} />
          <SubHead>Specification</SubHead>
          <Rows source="spec" a={a} b={b} fields={SPEC_FIELDS} />
        </>
      )}
      {!b && a && (
        <p className="px-3 py-3 text-[11px] text-dim">Tick a second run to compare.</p>
      )}
    </Panel>
  );
}

function Rows({
  source, a, b, fields,
}: {
  source: "summary" | "spec";
  a: LoadedRun | null;
  b: LoadedRun | null;
  fields: { key?: string; path?: string; label: string; unit: string; decimals: number; higherIsBetter?: boolean }[];
}) {
  const pick = (r: LoadedRun | null, f: { key?: string; path?: string }) => {
    if (!r) return null;
    if (source === "summary") {
      const v = r.summary[f.key as string];
      return typeof v === "number" ? v : v === null || v === undefined ? null : Number(v);
    }
    return at(r.spec, f.path as string);
  };

  const shown = fields.filter((f) => pick(a, f) !== null || pick(b, f) !== null);
  if (!shown.length) return <p className="px-3 pb-2 text-[10px] text-dim">Nothing recorded.</p>;

  return (
    <div className="flex flex-col gap-0.5 px-3 pb-2">
      {shown.map((f) => {
        const va = pick(a, f);
        const vb = pick(b, f);
        const d = va !== null && vb !== null ? vb - va : null;
        const same = d !== null && Math.abs(d) < 10 ** -(f.decimals + 1);
        const pct = d !== null && va ? (d / Math.abs(va)) * 100 : null;
        const good =
          f.higherIsBetter === undefined || d === null || same ? null : f.higherIsBetter === d > 0;
        return (
          <div key={f.label} className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1 truncate text-[11px] text-dim">{f.label}</span>
            <span className="num w-16 shrink-0 text-right text-[11px] text-dim">
              {va === null ? "–" : fixed(va, f.decimals)}
            </span>
            <span className="num w-16 shrink-0 text-right text-[11px] text-bright">
              {vb === null ? "–" : fixed(vb, f.decimals)}
            </span>
            <span
              className={`num w-20 shrink-0 text-right text-[11px] ${
                same ? "text-dim" : good === null ? "text-bright" : good ? "text-bright" : "text-alert"
              }`}
            >
              {d === null ? "–" : same ? "=" : `${d > 0 ? "+" : ""}${fixed(d, f.decimals)}`}
            </span>
            <span className="num w-14 shrink-0 text-right text-[10px] text-dim">
              {pct === null || same ? "" : `${pct > 0 ? "+" : ""}${fixed(pct, 1)}%`}
            </span>
            <span className="w-8 shrink-0 text-[9px] text-dim">{f.unit}</span>
          </div>
        );
      })}
    </div>
  );
}
