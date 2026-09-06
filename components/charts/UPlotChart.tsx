"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";
import { useSim } from "@/lib/store";

export interface SeriesSpec {
  label: string;
  data: Float32Array | number[];
  /** true for the reference run, drawn dim and dashed */
  ghost?: boolean;
  dash?: number[];
  width?: number;
  axis?: "y" | "y2";
}

export interface ChartSpec {
  title: string;
  x: Float32Array | number[];
  series: SeriesSpec[];
  yLabel?: string;
  y2Label?: string;
  yRange?: [number, number];
  y2Range?: [number, number];
  /** Only the bottom chart of a stack carries the time axis; the rest share it. */
  showXAxis?: boolean;
}

const COLOURS = {
  bright: "#ffffff",
  dim: "#6b6b6b",
  rule: "#1c1c1c",
  alert: "#ff3b1f",
};

/**
 * uPlot wrapper.
 *
 * The plot is built once per data identity and never re-rendered by React while
 * the trajectory plays. The playback cursor is a positioned element moved
 * directly from a store subscription, so scrubbing costs one transform per
 * frame rather than a canvas redraw of fifteen thousand points.
 */
const TITLE_H = 13;

export function UPlotChart({
  spec,
  height,
  syncKey = "reaper",
  onSeek,
}: {
  spec: ChartSpec;
  height: number;
  syncKey?: string;
  onSeek?: (t: number) => void;
}) {
  const plotH = Math.max(28, height - TITLE_H);
  const host = useRef<HTMLDivElement>(null);
  const plot = useRef<uPlot | null>(null);
  const cursor = useRef<HTMLDivElement>(null);
  const sizeRef = useRef({ w: 0, h: height });

  const data = useMemo<uPlot.AlignedData>(
    () => [spec.x as never, ...spec.series.map((s) => s.data as never)] as uPlot.AlignedData,
    [spec],
  );

  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return undefined;

    const build = (w: number) => {
      plot.current?.destroy();
      const opts: uPlot.Options = {
        width: Math.max(80, w),
        height: plotH,
        padding: [6, 8, 0, 0],
        cursor: {
          sync: { key: syncKey, setSeries: false },
          drag: { x: false, y: false },
          points: { show: false },
          y: false,
        },
        legend: { show: false },
        scales: {
          x: { time: false },
          y: spec.yRange ? { range: spec.yRange } : {},
          ...(spec.y2Range ? { y2: { range: spec.y2Range } } : {}),
        },
        axes: [
          {
            show: spec.showXAxis !== false,
            stroke: COLOURS.dim,
            grid: { stroke: COLOURS.rule, width: 1 },
            ticks: { stroke: COLOURS.rule, width: 1, size: 4 },
            font: '10px var(--font-jetbrains-mono), monospace',
            size: spec.showXAxis === false ? 0 : 20,
            space: 78,
          },
          {
            stroke: COLOURS.dim,
            grid: { stroke: COLOURS.rule, width: 1 },
            ticks: { stroke: COLOURS.rule, width: 1, size: 4 },
            font: '10px var(--font-jetbrains-mono), monospace',
            size: 40,
            space: 20,
          },
          ...(spec.series.some((s) => s.axis === "y2")
            ? [
                {
                  scale: "y2",
                  side: 1 as const,
                  stroke: COLOURS.dim,
                  grid: { show: false },
                  ticks: { stroke: COLOURS.rule, width: 1, size: 4 },
                  font: '10px var(--font-jetbrains-mono), monospace',
                  size: 40,
                },
              ]
            : []),
        ],
        series: [
          {},
          ...spec.series.map((s) => ({
            label: s.label,
            scale: s.axis === "y2" ? "y2" : "y",
            stroke: s.ghost ? COLOURS.dim : COLOURS.bright,
            width: s.width ?? (s.ghost ? 1 : 1.25),
            dash: s.dash ?? (s.ghost ? [3, 3] : undefined),
            points: { show: false },
            spanGaps: true,
          })),
        ],
        hooks: {
          ready: [
            (u: uPlot) => {
              sizeRef.current = { w: u.bbox.width / devicePixelRatio, h: u.bbox.height / devicePixelRatio };
            },
          ],
        },
      };
      plot.current = new uPlot(opts, data, el);
    };

    build(el.clientWidth);
    const ro = new ResizeObserver((entries) => {
      const w = entries[0].contentRect.width;
      if (plot.current) plot.current.setSize({ width: Math.max(80, w), height: plotH });
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      plot.current?.destroy();
      plot.current = null;
    };
  }, [data, plotH, syncKey, spec]);

  // Playback cursor, driven straight from the store without a React render.
  useEffect(() => {
    const place = (t: number) => {
      const u = plot.current;
      const c = cursor.current;
      if (!u || !c) return;
      const x = u.valToPos(t, "x");
      const inView = Number.isFinite(x) && x >= 0 && x <= u.bbox.width / devicePixelRatio + 1;
      c.style.transform = `translateX(${(u.bbox.left / devicePixelRatio + x).toFixed(1)}px)`;
      c.style.opacity = inView ? "1" : "0";
    };
    place(useSim.getState().t);
    return useSim.subscribe((s) => place(s.t));
  }, [data]);

  return (
    <div className="relative">
      <div
        className="flex items-center gap-2 px-1.5 text-[9px] uppercase tracking-[0.1em] text-dim"
        style={{ height: TITLE_H }}
      >
        <span className="shrink-0">{spec.title}</span>
        <span className="flex min-w-0 gap-2 truncate normal-case tracking-normal">
          {spec.series
            .filter((s) => !s.ghost)
            .map((s) => (
              <span key={s.label} className="flex items-center gap-1">
                <span
                  className="inline-block h-px w-3"
                  style={{
                    background: COLOURS.bright,
                    opacity: s.dash ? 0.55 : 1,
                  }}
                />
                {s.label}
              </span>
            ))}
        </span>
      </div>
      <div
        ref={host}
        className="w-full"
        onPointerDown={(e) => {
          const u = plot.current;
          if (!u || !onSeek) return;
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const px = e.clientX - r.left - u.bbox.left / devicePixelRatio;
          onSeek(u.posToVal(px, "x"));
        }}
      />
      <div
        ref={cursor}
        className="pointer-events-none absolute w-px bg-bright"
        style={{ height: plotH - (spec.showXAxis === false ? 2 : 20), top: TITLE_H, left: 0 }}
      />
    </div>
  );
}

/**
 * Resample a reference run onto another run's time base so both can share one
 * plot. Both grids are uniform 50 Hz, so this is a single forward scan.
 */
export function resampleOnto(
  targetT: Float32Array,
  sourceT: Float32Array | undefined,
  sourceY: Float32Array | undefined,
): Float32Array {
  const out = new Float32Array(targetT.length).fill(NaN);
  if (!sourceT || !sourceY || sourceT.length === 0) return out;
  let j = 0;
  for (let i = 0; i < targetT.length; i += 1) {
    const t = targetT[i];
    if (t < sourceT[0] || t > sourceT[sourceT.length - 1]) continue;
    while (j + 1 < sourceT.length && sourceT[j + 1] < t) j += 1;
    const k = Math.min(j + 1, sourceT.length - 1);
    const span = sourceT[k] - sourceT[j];
    const f = span > 1e-9 ? (t - sourceT[j]) / span : 0;
    out[i] = sourceY[j] + (sourceY[k] - sourceY[j]) * f;
  }
  return out;
}
