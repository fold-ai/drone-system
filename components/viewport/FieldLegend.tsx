"use client";

import { useEffect, useRef } from "react";
import { cssGradient, STOPS } from "@/lib/colormap";
import { fixed } from "@/lib/format";
import { sampleAt } from "@/lib/playback";
import { useSim } from "@/lib/store";
import { FIELD_MODES } from "./materials";

/**
 * Colourbar for the surface field.
 *
 * A coloured field with no legend is decoration. This carries the scale, the
 * real units, the domain limits, a marker at the current value and a note on
 * how the number was arrived at, so nothing on the airframe is coloured without
 * the reader being able to say what the colour means.
 */
export function FieldLegend({
  domain,
  unit,
  label,
  method,
  valueOf,
}: {
  domain: [number, number];
  unit: string;
  label: string;
  method: string;
  valueOf: (s: ReturnType<typeof sampleAt>) => number | null;
}) {
  const marker = useRef<HTMLDivElement>(null);
  const readout = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const write = (t: number) => {
      const { run } = useSim.getState();
      if (!run) return;
      const v = valueOf(sampleAt(run, t));
      if (v === null || !Number.isFinite(v)) {
        if (marker.current) marker.current.style.opacity = "0";
        if (readout.current) readout.current.textContent = "--";
        return;
      }
      const f = Math.min(1, Math.max(0, (v - domain[0]) / (domain[1] - domain[0] || 1)));
      if (marker.current) {
        marker.current.style.opacity = "1";
        marker.current.style.bottom = `${(f * 100).toFixed(2)}%`;
      }
      if (readout.current) readout.current.textContent = fixed(v, Math.abs(v) < 10 ? 3 : 1);
    };
    write(useSim.getState().t);
    return useSim.subscribe((s) => write(s.t));
  }, [domain, valueOf]);

  return (
    <div className="flex items-stretch gap-1.5 border border-rule bg-void/85 p-1.5">
      <div className="relative w-3 shrink-0" style={{ background: cssGradient("to top") }}>
        {STOPS.slice(1, -1).map((s) => (
          <div
            key={s.at}
            className="absolute left-0 right-0 h-px bg-black/40"
            style={{ bottom: `${s.at * 100}%` }}
          />
        ))}
        <div
          ref={marker}
          className="absolute -left-1 -right-1 h-px bg-bright"
          style={{ bottom: "0%", opacity: 0 }}
        >
          <div className="absolute -right-1 -top-[3px] h-0 w-0 border-y-[3px] border-r-[4px] border-y-transparent border-r-bright" />
        </div>
      </div>
      <div className="flex flex-col justify-between py-px">
        <span className="num text-[9px] text-dim">
          {fixed(domain[1], Math.abs(domain[1]) < 10 ? 2 : 0)}
        </span>
        <span className="num text-[9px] text-dim">
          {fixed(domain[0], Math.abs(domain[0]) < 10 ? 2 : 0)}
        </span>
      </div>
      <div className="flex w-[112px] flex-col justify-between">
        <div>
          <div className="text-[9px] uppercase tracking-[0.1em] text-dim">{label}</div>
          <div className="flex items-baseline gap-1">
            <span ref={readout} className="num text-[12px] text-bright">
              --
            </span>
            <span className="text-[9px] text-dim">{unit}</span>
          </div>
        </div>
        <p className="mt-1 text-[8px] leading-tight text-dim">{method}</p>
      </div>
    </div>
  );
}

export function FieldSelector() {
  const mode = useSim((s) => s.fieldMode);
  const setMode = useSim((s) => s.setFieldMode);
  const streams = useSim((s) => s.showStreamlines);
  const setStreams = useSim((s) => s.setShowStreamlines);

  return (
    <div className="flex items-center gap-2 border border-rule bg-void/85 px-1.5 py-1">
      <span className="text-[9px] uppercase tracking-[0.1em] text-dim">field</span>
      <div className="flex gap-px">
        {FIELD_MODES.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setMode(f.key)}
            title={f.method}
            className={`hit h-5 border border-rule px-1.5 text-[10px] ${
              mode === f.key ? "bg-bright text-void" : "bg-void text-dim hover:text-bright"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setStreams(!streams)}
        title="Illustrative streamlines: potential flow over a sphere, not a CFD solve"
        className={`hit h-5 border border-rule px-1.5 text-[10px] ${
          streams ? "bg-bright text-void" : "bg-void text-dim hover:text-bright"
        }`}
      >
        streamlines
      </button>
      {streams && (
        <span className="text-[9px] text-dim">illustrative flow, not CFD</span>
      )}
    </div>
  );
}
