"use client";

import { useMemo } from "react";
import { type ChartSpec, resampleOnto, UPlotChart } from "@/components/charts/UPlotChart";
import { extent } from "@/lib/playback";
import { useSim } from "@/lib/store";

/**
 * The chart stack: Mach and altitude, thrust against drag, throttle command
 * against actual, and fuel against mass. A reference run, when one is loaded,
 * is resampled onto the same time base and drawn dim and dashed.
 */
export function Telemetry({ height }: { height: number }) {
  const run = useSim((s) => s.run);
  const ghost = useSim((s) => s.ghost);
  const showGhost = useSim((s) => s.showGhost);
  const setT = useSim((s) => s.setT);

  const specs = useMemo<ChartSpec[]>(() => {
    if (!run?.cols.t) return [];
    const t = run.cols.t;
    const g = showGhost && ghost ? ghost : null;
    const ref = (col: keyof typeof run.cols) =>
      g ? resampleOnto(t, g.cols.t, g.cols[col] as Float32Array | undefined) : null;

    const build = (
      title: string,
      cols: { key: keyof typeof run.cols; label: string; axis?: "y" | "y2"; dash?: number[] }[],
      opts: Partial<ChartSpec> = {},
    ): ChartSpec => ({
      title,
      x: t,
      series: [
        ...cols.map((c) => ({
          label: c.label,
          data: (run.cols[c.key] ?? new Float32Array(t.length)) as Float32Array,
          axis: c.axis,
          dash: c.dash,
        })),
        ...(g
          ? cols.map((c) => ({
              label: `${c.label} ref`,
              data: (ref(c.key) ?? new Float32Array(t.length)) as Float32Array,
              axis: c.axis,
              ghost: true,
            }))
          : []),
      ],
      ...opts,
    });

    const machMax = Math.max(0.2, extent(run.cols.mach)[1] * 1.15);
    const altMax = Math.max(100, extent(run.cols.h_m)[1] * 1.1);
    const forceMax = Math.max(
      extent(run.cols.thrust_n)[1],
      extent(run.cols.drag_n)[1],
    ) * 1.1;

    return [
      build(
        "Mach / altitude",
        [
          { key: "mach", label: "M" },
          { key: "h_m", label: "h", axis: "y2", dash: [4, 3] },
        ],
        { yRange: [0, machMax], y2Range: [0, altMax] },
      ),
      build(
        "Thrust / drag  N",
        [
          { key: "thrust_n", label: "T" },
          { key: "drag_n", label: "D", dash: [4, 3] },
        ],
        { yRange: [0, Math.max(10, forceMax)] },
      ),
      build(
        "Throttle  commanded / actual",
        [
          { key: "throttle_cmd", label: "cmd" },
          { key: "throttle_act", label: "act", dash: [4, 3] },
        ],
        { yRange: [0, 1.02] },
      ),
      build(
        "Fuel  kg  /  mass  kg",
        [
          { key: "fuel_kg", label: "fuel" },
          { key: "mass_kg", label: "mass", axis: "y2", dash: [4, 3] },
        ],
        {
          yRange: [0, Math.max(0.1, extent(run.cols.fuel_kg)[1] * 1.15)],
          y2Range: [
            extent(run.cols.mass_kg)[0] * 0.98,
            extent(run.cols.mass_kg)[1] * 1.02,
          ],
        },
      ),
    ];
  }, [run, ghost, showGhost]);

  if (!run) {
    return (
      <div className="flex h-full items-center justify-center text-[11px] text-dim">
        No trajectory. Press RUN.
      </div>
    );
  }

  // Only the bottom chart carries the time axis; the four share one x scale, so
  // repeating it three more times would cost 60 px of trace height for nothing.
  const axisH = 20;
  const each = Math.max(46, Math.floor((height - axisH - specs.length) / specs.length));
  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden">
      {specs.map((s, i) => {
        const last = i === specs.length - 1;
        return (
          <div key={s.title} className={i > 0 ? "rule-t" : ""}>
            <UPlotChart
              spec={{ ...s, showXAxis: last }}
              height={each + (last ? axisH : 0)}
              onSeek={setT}
            />
          </div>
        );
      })}
    </div>
  );
}
