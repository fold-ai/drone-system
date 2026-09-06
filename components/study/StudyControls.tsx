"use client";

import { Panel, SubHead } from "@/components/ui/Panel";
import { Slider } from "@/components/ui/Slider";
import { readParam, useStudy } from "@/lib/studyStore";
import { FIELD_META } from "@/lib/types";

const GROUPS: { title: string; paths: string[] }[] = [
  {
    title: "Polar",
    paths: [
      "airframe.cd0_sub",
      "airframe.oswald_e",
      "airframe.mach_dd",
      "airframe.dcd_wave",
      "airframe.wave_width",
      "airframe.cl_max",
    ],
  },
  {
    title: "Planform",
    paths: ["airframe.wing_area_m2", "airframe.span_m", "airframe.length_m"],
  },
  {
    title: "Condition",
    paths: [
      "mission.cruise_altitude_m",
      "mission.target_mach",
      "airframe.mass_payload_kg",
      "airframe.fuel_capacity_kg",
    ],
  },
];

/** The working specification for the study. Edits here never touch the console. */
export function StudyControls() {
  const spec = useStudy((s) => s.spec);
  const setField = useStudy((s) => s.setField);
  const resetSpec = useStudy((s) => s.resetSpec);

  return (
    <Panel
      title="Specification"
      right={
        <button
          type="button"
          onClick={resetSpec}
          className="hit text-[10px] text-dim hover:text-bright"
        >
          defaults
        </button>
      }
      scroll
    >
      <div className="pb-4">
        {GROUPS.map((g) => (
          <div key={g.title}>
            <SubHead>{g.title}</SubHead>
            {g.paths.map((path) => {
              const m = FIELD_META[path];
              const v = readParam(spec, path);
              const d = FIELD_META[path]?.default;
              return (
                <Slider
                  key={path}
                  label={m?.label ?? path.split(".").pop() ?? path}
                  unit={m?.unit ?? ""}
                  value={v}
                  min={m?.min ?? 0}
                  max={m?.max ?? 1}
                  step={m?.step ?? 0.01}
                  defaultValue={typeof d === "number" ? d : undefined}
                  path={path}
                  onInput={(nv) => setField(path, nv)}
                  onReset={() =>
                    setField(path, (typeof d === "number" ? d : v) as number)
                  }
                  title={m?.doc}
                />
              );
            })}
          </div>
        ))}
        <p className="px-3 pt-2 text-[10px] leading-snug text-dim">
          A working copy of the specification. Nothing here changes the mission loaded in the
          console. Every range, step and default is generated from the Python dataclasses, so no
          control offers a value the solver has not agreed to.
        </p>
      </div>
    </Panel>
  );
}
