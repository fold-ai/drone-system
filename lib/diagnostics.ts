/**
 * Turning solver warnings into something actionable.
 *
 * The solver returns warnings as prose, and the physics package is not ours to
 * change, so the structure is recovered here by matching the solver's own
 * wording. Each rule contributes a severity, an instant on the timeline and the
 * controls that actually move the number, so a warning becomes a place to go
 * rather than a wall of red text.
 *
 * Anything unmatched still shows, as an advisory with no jump target. A warning
 * is never dropped because the classifier did not recognise it.
 */
import type { Run } from "./playback";

export type Severity = "blocking" | "advisory";

export interface Diagnostic {
  id: string;
  text: string;
  severity: Severity;
  /** Mission time to seek to, when the warning is about a moment. */
  t: number | null;
  /** Dotted MissionSpec paths of the controls that change this. */
  controls: string[];
  /** Short handle for the group heading. */
  topic: string;
}

interface Rule {
  match: RegExp;
  severity: Severity;
  topic: string;
  controls: string[];
  /** Event kind whose time this warning refers to. */
  at?: string;
}

const RULES: Rule[] = [
  {
    match: /rail exit|RATO booster is mandatory|leaves the rail unable to fly/i,
    severity: "blocking",
    topic: "Launch",
    at: "rail_exit",
    controls: [
      "launch.rail_length_m",
      "launch.booster.thrust_n",
      "launch.booster.burn_time_s",
      "launch.exit_margin",
    ],
  },
  {
    match: /tank holds|Maximum range on a full tank|exceeds tank capacity/i,
    severity: "blocking",
    topic: "Fuel",
    controls: [
      "mission.mission_distance_km",
      "airframe.fuel_capacity_kg",
      "mission.cruise_altitude_m",
      "mission.target_mach",
    ],
  },
  {
    match: /Static margin falls/i,
    severity: "advisory",
    topic: "Balance",
    at: "cg_limit",
    controls: ["airframe.x_fuel_m", "airframe.x_np_m", "airframe.x_payload_m"],
  },
  {
    match: /Level flight at M 1\.0|ram drag of the captured stream/i,
    severity: "advisory",
    topic: "Envelope",
    controls: ["airframe.wing_area_m2", "airframe.cd0_sub", "engine.mdot_0", "engine.ve"],
  },
  {
    match: /no cruise leg|more than the .* requested/i,
    severity: "advisory",
    topic: "Profile",
    controls: ["mission.mission_distance_km", "mission.cruise_altitude_m", "mission.climb_rate_ms"],
  },
  {
    match: /climb rate .* not sustainable|exceeds available specific excess power/i,
    severity: "advisory",
    topic: "Climb",
    at: "top_of_climb",
    controls: ["mission.climb_rate_ms", "mission.cruise_altitude_m"],
  },
  {
    match: /sizing estimate and the integrated trajectory disagree/i,
    severity: "advisory",
    topic: "Sizing",
    controls: ["mission.mission_distance_km", "mission.descent_throttle", "mission.descent_rate_ms"],
  },
  {
    match: /decimated/i,
    severity: "advisory",
    topic: "Output",
    controls: ["mission.duration_s", "integration.output_hz"],
  },
  {
    match: /Fuel mass set manually|overridden manually/i,
    severity: "advisory",
    topic: "Fuel",
    controls: ["mission.auto_fuel", "mission.fuel_mass_kg"],
  },
];

export function classify(run: Run | null): Diagnostic[] {
  if (!run) return [];
  const out: Diagnostic[] = [];
  run.warnings.forEach((text, i) => {
    const rule = RULES.find((r) => r.match.test(text));
    const event = rule?.at ? run.events.find((e) => e.kind === rule.at) : undefined;
    out.push({
      id: `w${i}`,
      text,
      severity: rule?.severity ?? "advisory",
      topic: rule?.topic ?? "Note",
      t: event ? event.t : null,
      controls: rule?.controls ?? [],
    });
  });
  // Blocking first, then by the order the solver reported them.
  return out.sort((a, b) =>
    a.severity === b.severity ? 0 : a.severity === "blocking" ? -1 : 1,
  );
}

export function countBySeverity(list: Diagnostic[]): { blocking: number; advisory: number } {
  return {
    blocking: list.filter((d) => d.severity === "blocking").length,
    advisory: list.filter((d) => d.severity === "advisory").length,
  };
}

/** Which configuration tab holds a given field path. */
export function tabForPath(path: string): "mission" | "launch" | "model" {
  if (path.startsWith("launch.")) return "launch";
  if (
    path.startsWith("mission.") ||
    path.startsWith("atmosphere.") ||
    path === "airframe.mass_payload_kg" ||
    path === "airframe.fuel_capacity_kg" ||
    path === "airframe.mass_airframe_kg" ||
    path === "airframe.mass_engine_kg" ||
    path === "airframe.mass_avionics_kg"
  ) {
    return "mission";
  }
  return "model";
}
