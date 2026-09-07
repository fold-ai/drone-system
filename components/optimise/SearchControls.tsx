"use client";

import { Button } from "@/components/ui/Button";
import { Panel, SubHead } from "@/components/ui/Panel";
import { fixed } from "@/lib/format";
import { CONSTRAINTS, OBJECTIVES, useOptimise } from "@/lib/optimiseStore";

const VARIABLES = [
  { key: "length_m", label: "Overall length", unit: "m" },
  { key: "aspect_ratio", label: "Aspect ratio", unit: "" },
  { key: "cd0_sub", label: "Parasite drag CD0", unit: "" },
  { key: "mach_dd", label: "Drag divergence Mach", unit: "M" },
  { key: "oswald_e", label: "Oswald efficiency", unit: "" },
  { key: "mass_payload_kg", label: "Payload", unit: "kg" },
  { key: "fuel_capacity_kg", label: "Tank capacity", unit: "kg" },
  { key: "rail_length_m", label: "Rail length", unit: "m" },
  { key: "booster_impulse_ns", label: "Booster impulse", unit: "N s" },
];

/**
 * What is being searched, over what, and subject to what.
 *
 * The design vector is declared here rather than inferred, so the operator can
 * see exactly which quantities the search is allowed to move and read the run
 * later knowing what was held fixed.
 */
export function SearchControls() {
  const s = useOptimise();
  const busy = s.phase === "running" || s.phase === "starting";

  return (
    <Panel title="SEARCH" scroll bodyClassName="pb-4">
      <SubHead>Objective</SubHead>
      <div className="grid grid-cols-2 gap-1 px-3">
        {OBJECTIVES.map((o) => (
          <Button
            key={o.key}
            active={s.objective === o.key}
            disabled={busy}
            onClick={() => s.setObjective(o.key)}
            className="justify-start"
          >
            {o.label}
          </Button>
        ))}
      </div>

      <SubHead right={<span className="num text-[10px] text-dim">{s.keys.length} of 9</span>}>
        Design vector
      </SubHead>
      <div className="flex flex-col gap-px px-3">
        {VARIABLES.map((v) => {
          const on = s.keys.includes(v.key);
          return (
            <button
              key={v.key}
              type="button"
              disabled={busy}
              onClick={() => s.toggleKey(v.key)}
              className={`hit flex items-center gap-2 border px-2 py-1 text-left text-[11px] disabled:opacity-40 ${
                on
                  ? "border-rule bg-void text-bright"
                  : "border-transparent text-dim hover:text-bright"
              }`}
            >
              <span
                aria-hidden
                className={`inline-block h-2 w-2 shrink-0 border ${
                  on ? "border-bright bg-bright" : "border-rule"
                }`}
              />
              <span className="truncate">{v.label}</span>
              {v.unit && <span className="ml-auto shrink-0 text-[10px] text-dim">{v.unit}</span>}
            </button>
          );
        })}
      </div>
      <p className="px-3 pt-1 text-[10px] leading-snug text-dim">
        Unticked quantities are held at the base specification. Aspect ratio moves at constant
        reference area, by re-lofting the measured planform.
      </p>

      <SubHead>Constraints</SubHead>
      <div className="flex flex-col gap-1.5 px-3">
        {CONSTRAINTS.map((c) => (
          <label key={c.key} className="flex items-center gap-2" title={c.note}>
            <span className="min-w-0 flex-1 truncate text-[11px] text-dim">{c.label}</span>
            <input
              type="number"
              disabled={busy}
              value={s.constraints[c.key] ?? c.value}
              min={c.min}
              max={c.max}
              step={c.step}
              onChange={(e) => s.setConstraint(c.key, Number(e.target.value))}
              className="num w-20 shrink-0 px-1 text-right text-[11px]"
            />
          </label>
        ))}
      </div>

      <SubHead>Budget</SubHead>
      <div className="flex flex-col gap-1.5 px-3">
        <label className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[11px] text-dim">Evaluations</span>
          <input
            type="number"
            disabled={busy}
            value={s.target}
            min={50}
            max={5000}
            step={50}
            onChange={(e) => s.setTarget(Number(e.target.value))}
            className="num w-20 shrink-0 px-1 text-right text-[11px]"
          />
        </label>
        <label className="flex items-center gap-2" title="Differential evolution population size">
          <span className="min-w-0 flex-1 truncate text-[11px] text-dim">Population</span>
          <input
            type="number"
            disabled={busy}
            value={s.population}
            min={8}
            max={64}
            step={4}
            onChange={(e) => s.setPopulation(Number(e.target.value))}
            className="num w-20 shrink-0 px-1 text-right text-[11px]"
          />
        </label>
        <label className="flex items-center gap-2" title="Base airframe length before the search moves it">
          <span className="min-w-0 flex-1 truncate text-[11px] text-dim">Base length</span>
          <input
            type="number"
            disabled={busy}
            value={s.base.airframe.length_m}
            min={1.2}
            max={3.2}
            step={0.05}
            onChange={(e) => s.setBaseLength(Number(e.target.value))}
            className="num w-20 shrink-0 px-1 text-right text-[11px]"
          />
        </label>
        <p className="text-[10px] leading-snug text-dim">
          Every evaluation is a real solver call and is written to the run table, so a search of{" "}
          {s.target} costs {s.target} solves and stays auditable afterwards.
        </p>
      </div>

      <div className="flex gap-1 px-3 pt-3">
        {s.phase === "running" ? (
          <>
            <Button onClick={() => s.pause()}>Pause</Button>
            <Button variant="alert" onClick={() => void s.cancel()}>
              Cancel
            </Button>
          </>
        ) : s.phase === "paused" ? (
          <>
            <Button variant="primary" onClick={() => s.resume()}>
              Resume
            </Button>
            <Button variant="alert" onClick={() => void s.cancel()}>
              Cancel
            </Button>
          </>
        ) : (
          <Button variant="primary" disabled={busy} onClick={() => void s.start()}>
            {s.phase === "starting" ? "Starting" : "Run search"}
          </Button>
        )}
        {s.batchMs > 0 && (
          <span className="num ml-auto self-center text-[10px] text-dim">
            {fixed(s.batchMs / 1000, 1)} s / batch
          </span>
        )}
      </div>
      {s.message && <p className="px-3 pt-2 text-[11px] text-alert">{s.message}</p>}
    </Panel>
  );
}
