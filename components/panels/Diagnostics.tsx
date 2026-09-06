"use client";

import { classify, countBySeverity, tabForPath } from "@/lib/diagnostics";
import { clock } from "@/lib/format";
import { useSim } from "@/lib/store";
import { FIELD_META } from "@/lib/types";

/**
 * Warnings, grouped and actionable.
 *
 * A flat red wall says something is wrong but not where to go. These are split
 * into blocking (the mission as configured cannot be flown) and advisory (it
 * flies, but something is worth knowing), and every row carries the instant it
 * happened and the controls that move it. Clicking the time seeks the timeline;
 * clicking a control opens the tab it lives on and highlights it.
 *
 * Severity is never carried by colour alone: blocking rows are marked with a
 * bar and a glyph as well.
 */
export function Diagnostics({ onClose }: { onClose: () => void }) {
  const run = useSim((s) => s.run);
  const setT = useSim((s) => s.setT);
  const focusOn = useSim((s) => s.focusOn);
  const setConfigTab = useSim((s) => s.setConfigTab);
  const list = classify(run);
  const counts = countBySeverity(list);

  if (!run || list.length === 0) return null;

  const groups: { key: "blocking" | "advisory"; title: string; note: string }[] = [
    {
      key: "blocking",
      title: `Blocking (${counts.blocking})`,
      note: "The mission as configured cannot be flown.",
    },
    {
      key: "advisory",
      title: `Advisory (${counts.advisory})`,
      note: "The mission flies. These are worth knowing.",
    },
  ];

  return (
    <div className="max-h-[46vh] shrink-0 overflow-y-auto rule-b bg-panel">
      <div className="sticky top-0 flex items-center justify-between gap-3 rule-b bg-panel px-3 py-1.5">
        <span className="tracked text-[10px] text-dim">Diagnostics</span>
        <button
          type="button"
          onClick={onClose}
          className="hit text-[10px] text-dim hover:text-bright"
        >
          close
        </button>
      </div>

      {groups.map((g) => {
        const rows = list.filter((d) => d.severity === g.key);
        if (rows.length === 0) return null;
        return (
          <div key={g.key} className="rule-b">
            <div className="flex items-baseline gap-2 px-3 pt-2">
              <span
                className={`text-[10px] uppercase tracking-[0.1em] ${
                  g.key === "blocking" ? "text-alert" : "text-dim"
                }`}
              >
                {g.title}
              </span>
              <span className="text-[10px] text-dim">{g.note}</span>
            </div>
            <ul className="px-3 py-1.5">
              {rows.map((d) => (
                <li
                  key={d.id}
                  className={`mb-1.5 border-l-2 pl-2 ${
                    d.severity === "blocking" ? "border-alert" : "border-rule"
                  }`}
                >
                  <p
                    className={`flex gap-1.5 text-[11px] leading-snug ${
                      d.severity === "blocking" ? "text-alert" : "text-bright"
                    }`}
                  >
                    <span className="num shrink-0">{d.severity === "blocking" ? "!" : "-"}</span>
                    <span>{d.text}</span>
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className="text-[9px] uppercase tracking-[0.1em] text-dim">
                      {d.topic}
                    </span>
                    {d.t !== null && (
                      <button
                        type="button"
                        onClick={() => setT(d.t as number)}
                        title="Seek the timeline to this instant"
                        className="hit num border border-rule px-1.5 text-[10px] text-dim hover:border-dim hover:text-bright"
                      >
                        {clock(d.t)}
                      </button>
                    )}
                    {d.controls.map((path) => (
                      <button
                        key={path}
                        type="button"
                        onClick={() => {
                          setConfigTab(tabForPath(path));
                          focusOn(path);
                        }}
                        title={FIELD_META[path]?.doc ?? path}
                        className="hit border border-rule px-1.5 text-[10px] text-dim hover:border-dim hover:text-bright"
                      >
                        {FIELD_META[path]?.label ?? path.split(".").pop()}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

/** Header badge. Blocking count is red and carries a glyph; advisory is neutral. */
export function DiagnosticsBadge({ onClick }: { onClick: () => void }) {
  const run = useSim((s) => s.run);
  const list = classify(run);
  if (list.length === 0) return null;
  const { blocking, advisory } = countBySeverity(list);
  return (
    <button
      type="button"
      onClick={onClick}
      title="Grouped warnings, each linked to the moment and the control that causes it"
      className={`hit flex h-6 items-center gap-1.5 border px-2 text-[11px] ${
        blocking > 0 ? "border-alert text-alert" : "border-rule text-dim hover:text-bright"
      }`}
    >
      {blocking > 0 && <span className="num">!</span>}
      <span>
        {blocking > 0 ? `${blocking} blocking` : ""}
        {blocking > 0 && advisory > 0 ? " / " : ""}
        {advisory > 0 ? `${advisory} advisory` : ""}
      </span>
    </button>
  );
}
