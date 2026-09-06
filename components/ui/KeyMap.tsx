"use client";

import { useEffect } from "react";
import { useSim } from "@/lib/store";

const GROUPS: { title: string; keys: [string, string][] }[] = [
  {
    title: "Playback",
    keys: [
      ["Space", "play or pause"],
      ["Left / Right", "step half a second"],
      ["Shift + Left / Right", "step five seconds"],
      ["Home / End", "start or end of the run"],
    ],
  },
  {
    title: "Viewport",
    keys: [
      ["1 - 6", "chase, rail, side, top, cockpit, orbit"],
      ["Drag", "orbit the current camera"],
      ["Wheel", "pull in and out"],
      ["R", "recentre the view"],
    ],
  },
  {
    title: "Controls",
    keys: [
      ["Shift + arrows", "one tenth of a step on a slider"],
      ["Type a unit", "\"3.5 km\", \"2.4 kN\", \"85%\" are all understood"],
      ["Enter / Escape", "commit or discard a typed value"],
    ],
  },
  {
    title: "Interface",
    keys: [
      ["?", "this map"],
      ["Escape", "close an overlay"],
    ],
  },
];

/** Keyboard map, on "?". */
export function KeyMap() {
  const open = useSim((s) => s.keymapOpen);
  const setOpen = useSim((s) => s.setKeymapOpen);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (e.key === "?") {
        e.preventDefault();
        setOpen(!useSim.getState().keymapOpen);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  if (!open) return null;
  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-void/80"
      onClick={() => setOpen(false)}
    >
      <div
        className="max-h-[80vh] overflow-y-auto border border-rule bg-panel p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between gap-8 rule-b pb-2">
          <span className="tracked text-[11px] text-bright">Keyboard</span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="hit text-[10px] text-dim hover:text-bright"
          >
            close
          </button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-4">
          {GROUPS.map((g) => (
            <div key={g.title}>
              <div className="mb-1 text-[10px] uppercase tracking-[0.1em] text-dim">{g.title}</div>
              {g.keys.map(([k, what]) => (
                <div key={k} className="flex items-baseline justify-between gap-6 py-0.5">
                  <span className="num shrink-0 border border-rule px-1.5 text-[10px] text-bright">
                    {k}
                  </span>
                  <span className="text-right text-[11px] text-dim">{what}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
