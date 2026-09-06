"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Slider, Toggle } from "@/components/ui/Slider";
import { getPath, useSim } from "@/lib/store";
import { FIELD_META, MODEL_PARAM_GROUPS } from "@/lib/types";

/**
 * Every model constant, with its default and a reset.
 *
 * The list, the ranges and the note beside each field are generated from the
 * Python dataclasses, so a constant cannot appear here with a limit the solver
 * has not agreed to.
 */
export function ModelParams() {
  const spec = useSim((s) => s.spec);
  const ghost = useSim((s) => s.ghost);
  const focusField = useSim((s) => s.focusField);
  const setField = useSim((s) => s.setField);
  const resetField = useSim((s) => s.resetField);
  const [open, setOpen] = useState<string | null>("Airframe");
  const [filter, setFilter] = useState("");

  const groups = useMemo(
    () =>
      MODEL_PARAM_GROUPS.map((g) => ({
        ...g,
        fields: Object.values(FIELD_META).filter(
          (f) =>
            f.path.startsWith(`${g.prefix}.`) &&
            f.path.split(".").length === g.prefix.split(".").length + 1 &&
            (!filter ||
              f.path.toLowerCase().includes(filter.toLowerCase()) ||
              (f.doc ?? "").toLowerCase().includes(filter.toLowerCase())),
        ),
      })).filter((g) => g.fields.length > 0),
    [filter],
  );

  const dirty = Object.values(FIELD_META).filter((f) => {
    const v = getPath(spec, f.path);
    return typeof v === "number" && typeof f.default === "number"
      ? Math.abs(v - f.default) > (f.step ?? 1e-9) / 2
      : v !== f.default;
  });

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 rule-b px-3 py-1.5">
        <input
          type="text"
          value={filter}
          placeholder="filter"
          onChange={(e) => setFilter(e.target.value)}
          className="min-w-0 flex-1 text-[11px]"
        />
        <span className="num shrink-0 text-[10px] text-dim">
          {dirty.length} changed
        </span>
        <Button
          variant="ghost"
          disabled={dirty.length === 0}
          onClick={() => dirty.forEach((f) => resetField(f.path))}
          title="Return every constant to its model default"
        >
          reset all
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {groups.map((g) => {
          // A focused field forces its own group open, so a jump from a
          // diagnostic lands on the control rather than a collapsed heading.
          const holdsFocus = Boolean(focusField && focusField.startsWith(`${g.prefix}.`));
          const isOpen = open === g.title || filter.length > 0 || holdsFocus;
          return (
            <div key={g.title} className="rule-b">
              <button
                type="button"
                onClick={() => setOpen(isOpen && !filter ? null : g.title)}
                className="hit flex w-full items-center justify-between px-3 py-1.5 text-left text-[10px] uppercase tracking-[0.1em] text-dim hover:text-bright"
              >
                <span>{g.title}</span>
                <span className="num">{isOpen ? "−" : "+"}</span>
              </button>
              {isOpen && (
                <div className="pb-1">
                  {g.fields.map((f) => {
                    const v = getPath(spec, f.path);
                    if (f.type === "boolean") {
                      return (
                        <Toggle
                          key={f.path}
                          label={f.label}
                          checked={Boolean(v)}
                          onChange={(b) => setField(f.path, b)}
                          title={f.doc}
                          path={f.path}
                          highlight={focusField === f.path}
                        />
                      );
                    }
                    if (typeof v !== "number") return null;
                    const min = f.min ?? Math.min(0, v * 2);
                    const max = f.max ?? Math.max(1, v * 2);
                    const ref = ghost ? getPath(ghost.spec, f.path) : undefined;
                    return (
                      <Slider
                        key={f.path}
                        label={f.label}
                        unit={f.unit}
                        value={v}
                        min={min}
                        max={max}
                        step={f.step ?? (max - min) / 200}
                        defaultValue={typeof f.default === "number" ? f.default : undefined}
                        reference={typeof ref === "number" ? ref : undefined}
                        path={f.path}
                        highlight={focusField === f.path}
                        onInput={(nv) => setField(f.path, nv)}
                        onReset={() => resetField(f.path)}
                        title={f.doc ? `${f.doc}  |  default ${f.default}` : undefined}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
