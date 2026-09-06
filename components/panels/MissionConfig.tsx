"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { Panel, SubHead } from "@/components/ui/Panel";
import { Readout, TextRow, Verdict } from "@/components/ui/Readout";
import { Slider, Toggle } from "@/components/ui/Slider";
import { fixed } from "@/lib/format";
import { getPath, useSim } from "@/lib/store";
import { FIELD_META } from "@/lib/types";
import { GeometryCheck } from "./GeometryCheck";
import { ModelParams } from "./ModelParams";

function meta(path: string) {
  const m = FIELD_META[path];
  return {
    min: m?.min ?? 0,
    max: m?.max ?? 1,
    step: m?.step ?? 0.01,
    unit: m?.unit ?? "",
    doc: m?.doc,
    default: typeof m?.default === "number" ? m.default : undefined,
  };
}

/**
 * One configuration control.
 *
 * Range, step, unit and default all come from FIELD_META, which is generated
 * from the Python dataclasses, so a control cannot offer a value the solver has
 * not agreed to. The reference column is the same field in the held run.
 */
function Field({ path, label }: { path: string; label: string }) {
  const spec = useSim((s) => s.spec);
  const ghost = useSim((s) => s.ghost);
  const focusField = useSim((s) => s.focusField);
  const setField = useSim((s) => s.setField);
  const resetField = useSim((s) => s.resetField);
  const m = meta(path);
  const value = getPath(spec, path);
  if (typeof value !== "number") return null;
  const ref = ghost ? getPath(ghost.spec, path) : undefined;
  return (
    <Slider
      label={label}
      unit={m.unit}
      value={value}
      min={m.min}
      max={m.max}
      step={m.step}
      defaultValue={m.default}
      reference={typeof ref === "number" ? ref : undefined}
      path={path}
      highlight={focusField === path}
      onInput={(v) => setField(path, v)}
      onReset={() => resetField(path)}
      title={m.doc}
    />
  );
}

/** Scroll a focused field into view and clear the focus once it has landed. */
function useFocusScroll(scope: React.RefObject<HTMLElement | null>) {
  const focusField = useSim((s) => s.focusField);
  const focusOn = useSim((s) => s.focusOn);
  useEffect(() => {
    if (!focusField) return undefined;
    const el = scope.current?.querySelector(`[data-field="${focusField}"]`);
    el?.scrollIntoView({ block: "center", behavior: "auto" });
    const id = window.setTimeout(() => focusOn(null), 2600);
    return () => window.clearTimeout(id);
  }, [focusField, focusOn, scope]);
}

/**
 * Mission configuration.
 *
 * Everything in the top block feeds the range-to-fuel calculation, and every
 * derived figure below it comes back from the solver rather than being
 * estimated here. Dragging the distance slider re-sizes the fuel, which moves
 * gross mass, wing loading, stall speed and the rail-exit requirement.
 */
export function MissionConfig() {
  const spec = useSim((s) => s.spec);
  const feas = useSim((s) => s.feas);
  const setField = useSim((s) => s.setField);
  const refresh = useSim((s) => s.refreshFeasibility);
  const tab = useSim((s) => s.configTab);
  const setTab = useSim((s) => s.setConfigTab);
  const scope = useRef<HTMLDivElement>(null);
  useFocusScroll(scope);

  useEffect(() => {
    void refresh({ solve_booster: true, rail_trade: true });
  }, [refresh]);

  const fuel = feas?.fuel;
  const d = feas?.derived;
  const lf = feas?.launch;

  return (
    <Panel
      title="Mission config"
      right={
        <div className="flex gap-px">
          {(["mission", "launch", "model"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`hit h-5 px-1.5 text-[10px] ${
                tab === k ? "bg-bright text-void" : "text-dim hover:text-bright"
              }`}
            >
              {k}
            </button>
          ))}
        </div>
      }
      scroll={tab !== "model"}
    >
      <div ref={scope} className="contents">
      {tab === "model" ? (
        <ModelParams />
      ) : tab === "launch" ? (
        <LaunchTab />
      ) : (
        <div className="pb-4">
          <SubHead>Profile</SubHead>
          {[
            ["mission.mission_distance_km", "Mission distance"],
            ["mission.cruise_altitude_m", "Cruise altitude"],
            ["mission.target_mach", "Target Mach"],
            ["mission.climb_rate_ms", "Climb rate"],
            ["mission.descent_rate_ms", "Descent rate"],
            ["mission.descent_throttle", "Descent throttle"],
            ["mission.end_altitude_m", "End altitude"],
            ["mission.reserve_frac", "Fuel reserve"],
          ].map(([path, label]) => (
            <Field key={path} path={path} label={label} />
          ))}

          <SubHead>Mass</SubHead>
          {[
            ["airframe.mass_payload_kg", "Payload"],
            ["airframe.fuel_capacity_kg", "Tank capacity"],
            ["airframe.mass_airframe_kg", "Carbon airframe"],
            ["airframe.mass_engine_kg", "Turbojet + mounts"],
            ["airframe.mass_avionics_kg", "Avionics + battery"],
          ].map(([path, label]) => (
            <Field key={path} path={path} label={label} />
          ))}
          <Toggle
            label="Size fuel from range"
            checked={spec.mission.auto_fuel}
            onChange={(b) => setField("mission.auto_fuel", b)}
            title="Off: set the fuel mass directly and read the range that results"
          />
          {!spec.mission.auto_fuel && (
            <Field path="mission.fuel_mass_kg" label="Fuel mass" />
          )}

          <SubHead>Atmosphere</SubHead>
          {[
            ["atmosphere.delta_isa_k", "Non-standard day"],
            ["atmosphere.headwind_ms", "Headwind"],
            ["atmosphere.ground_altitude_m", "Site elevation"],
          ].map(([path, label]) => (
            <Field key={path} path={path} label={label} />
          ))}

          <div className="mt-2 rule-t px-3 pt-2">
            <h3 className="tracked text-[10px] text-dim">Derived</h3>
            <div className="mt-1.5 space-y-0.5">
              <Readout label="Fuel required" value={fuel?.fuel_required_kg} unit="kg" decimals={3} width={7}
                alert={fuel ? !fuel.feasible : false} />
              <Readout label="Fuel loaded" value={fuel?.fuel_loaded_kg} unit="kg" decimals={3} width={7} />
              <Readout label="Gross mass" value={d?.gross_mass_kg} unit="kg" decimals={2} width={7} />
              <Readout label="Wing loading" value={d?.wing_loading_nm2} unit="N/m2" decimals={0} width={7} />
              <Readout label="Stall speed, SL" value={d?.v_stall_sl_ms} unit="m/s" decimals={1} width={7} />
              <Readout label="Cruise TAS" value={fuel?.cruise_tas_ms} unit="m/s" decimals={1} width={7} />
              <Readout label="Cruise L/D" value={fuel?.cruise_ld} unit="" decimals={2} width={7}
                title="Lift to drag at the requested cruise Mach. Best L/D occurs far slower." />
              <Readout label="Best L/D" value={d?.ld_max} unit={`at ${fixed(d?.v_best_ld_ms ?? 0, 0)} m/s`} decimals={2} width={7} />
              <Readout label="Static margin, full" value={(d?.static_margin_full ?? 0) * 100} unit="% MAC" decimals={1} width={7} />
              <Readout
                label="Static margin, dry"
                value={(d?.static_margin_empty ?? 0) * 100}
                unit="% MAC"
                decimals={1}
                width={7}
                alert={(d?.static_margin_empty ?? 1) < spec.airframe.static_margin_min}
              />
              <Readout label="Max range, full tank" value={fuel?.max_range_at_capacity_km} unit="km" decimals={1} width={7} />
              <TextRow
                label="Range achievable"
                value={<Verdict ok={Boolean(fuel?.feasible)} pass="YES" fail="NO" />}
              />
              <TextRow
                label="Launch"
                value={<Verdict ok={Boolean(lf?.feasible)} />}
              />
            </div>
            {fuel?.note && (
              <p className="mt-2 border border-alert px-2 py-1.5 text-[10px] leading-snug text-alert">
                {fuel.note}
              </p>
            )}
            <div className="mt-3">
              <GeometryCheck />
            </div>
          </div>
        </div>
      )}
      </div>
    </Panel>
  );
}

function LaunchTab() {
  const spec = useSim((s) => s.spec);
  const feas = useSim((s) => s.feas);
  const setField = useSim((s) => s.setField);
  const refresh = useSim((s) => s.refreshFeasibility);
  const focusField = useSim((s) => s.focusField);
  const sol = feas?.booster_solution;
  const trade = feas?.rail_trade ?? [];
  const lf = feas?.launch;
  const applied = useRef(false);

  useEffect(() => {
    void refresh({ solve_booster: true, rail_trade: true });
  }, [refresh, spec.launch.rail_length_m, spec.launch.exit_margin, spec.airframe.cl_max]);

  return (
    <div className="pb-4">
      <SubHead>Rail</SubHead>
      {[
            ["launch.rail_length_m", "Rail length"],
            ["launch.rail_angle_deg", "Rail angle"],
            ["launch.rail_friction_mu", "Carriage friction"],
            ["launch.exit_margin", "Exit margin"],
          ].map(([path, label]) => (
            <Field key={path} path={path} label={label} />
          ))}

      <div className="px-3 pt-2">
        <div className="space-y-0.5">
          <Readout label="Stall speed at launch" value={lf?.v_stall_ms} unit="m/s" decimals={1} width={6} />
          <Readout label="Required exit" value={lf?.v_required_ms} unit="m/s" decimals={1} width={6} />
          <Readout
            label="Engine alone"
            value={feas?.engine_only_exit_ms}
            unit="m/s"
            decimals={1}
            width={6}
            alert={feas ? !feas.engine_only_feasible : false}
          />
          <Readout
            label="With booster"
            value={lf?.v_exit_ms}
            unit="m/s"
            decimals={1}
            width={6}
            alert={lf ? !lf.feasible : false}
          />
          <Readout label="Exit margin" value={lf?.margin_ratio} unit="x Vs" decimals={2} width={6}
            alert={(lf?.margin_ratio ?? 0) < spec.launch.exit_margin} />
          <Readout label="Peak rail load" value={lf?.peak_rail_accel_g} unit="g" decimals={0} width={6} />
          <TextRow label="Launch feasible" value={<Verdict ok={Boolean(lf?.feasible)} />} />
        </div>
        {feas && !feas.engine_only_feasible && (
          <p className="mt-2 border border-rule px-2 py-1.5 text-[10px] leading-snug text-dim">
            Engine thrust alone reaches {fixed(feas.engine_only_exit_ms, 1)} m/s at the end of a{" "}
            {fixed(spec.launch.rail_length_m, 1)} m rail against{" "}
            {fixed(lf?.v_required_ms ?? 0, 1)} m/s required. A RATO booster is mandatory.
          </p>
        )}
      </div>

      <SubHead>RATO booster</SubHead>
      <Toggle
        label="Booster fitted"
        checked={spec.launch.booster.enabled}
        onChange={(b) => setField("launch.booster.enabled", b)}
        path="launch.booster.enabled"
        highlight={focusField === "launch.booster.enabled"}
      />
      <Toggle
        label="Jettison at burnout"
        checked={spec.launch.booster.jettison}
        onChange={(b) => setField("launch.booster.jettison", b)}
      />
      {[
            ["launch.booster.thrust_n", "Booster thrust"],
            ["launch.booster.burn_time_s", "Burn time"],
            ["launch.booster.mass_kg", "Booster mass"],
          ].map(([path, label]) => (
            <Field key={path} path={path} label={label} />
          ))}
      <div className="px-3">
        <Readout
          label="Total impulse"
          value={spec.launch.booster.thrust_n * spec.launch.booster.burn_time_s}
          unit="N s"
          decimals={0}
          width={6}
        />
      </div>

      {sol && (
        <div className="mx-3 mt-3 border border-rule">
          <div className="rule-b px-2 py-1 text-[10px] uppercase tracking-[0.1em] text-dim">
            Solved minimum booster
          </div>
          <div className="space-y-0.5 px-2 py-1.5">
            <Readout label="Thrust" value={sol.booster_thrust_n} unit="N" decimals={0} width={6} />
            <Readout label="Burn time" value={sol.booster_burn_time_s * 1000} unit="ms" decimals={0} width={6} />
            <Readout label="Total impulse" value={sol.booster_impulse_ns} unit="N s" decimals={0} width={6} />
            <Readout label="Peak load" value={sol.peak_rail_accel_g} unit="g" decimals={0} width={6} />
          </div>
          <div className="rule-t px-2 py-1.5">
            <Button
              onClick={() => {
                setField("launch.booster.thrust_n", Math.ceil(sol.booster_thrust_n / 25) * 25);
                setField("launch.booster.burn_time_s", Math.ceil(sol.booster_burn_time_s * 100) / 100);
                setField("launch.booster.enabled", true);
                applied.current = true;
              }}
              className="w-full"
            >
              apply to configuration
            </Button>
          </div>
        </div>
      )}

      {trade.length > 0 && (
        <div className="mx-3 mt-3 border border-rule">
          <div className="rule-b px-2 py-1 text-[10px] uppercase tracking-[0.1em] text-dim">
            Rail length trade
          </div>
          <table className="w-full text-[10px]">
            <thead>
              <tr className="text-dim">
                <th className="px-2 py-1 text-left font-normal">rail</th>
                <th className="px-1 py-1 text-right font-normal">thrust</th>
                <th className="px-1 py-1 text-right font-normal">burn</th>
                <th className="px-1 py-1 text-right font-normal">impulse</th>
                <th className="px-2 py-1 text-right font-normal">peak</th>
              </tr>
            </thead>
            <tbody className="num">
              {trade.map((r) => (
                <tr
                  key={r.rail_length_m}
                  className={`hit cursor-pointer hover:bg-bright/5 ${
                    Math.abs(r.rail_length_m - spec.launch.rail_length_m) < 0.05 ? "bg-bright/8" : ""
                  }`}
                  onClick={() => setField("launch.rail_length_m", r.rail_length_m)}
                >
                  <td className="px-2 py-0.5">{fixed(r.rail_length_m, 1, 4)} m</td>
                  <td className="px-1 py-0.5 text-right">{fixed(r.booster_thrust_n, 0, 5)}</td>
                  <td className="px-1 py-0.5 text-right">{fixed(r.booster_burn_time_s * 1000, 0, 4)}</td>
                  <td className="px-1 py-0.5 text-right">{fixed(r.booster_impulse_ns, 0, 4)}</td>
                  <td className="px-2 py-0.5 text-right">{fixed(r.peak_g, 0, 3)} g</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="rule-t px-2 py-1.5 text-[10px] leading-snug text-dim">
            Thrust falls roughly as one over rail length while total impulse stays near
            constant. A longer rail buys a smaller motor, not less energy.
          </p>
        </div>
      )}
    </div>
  );
}
