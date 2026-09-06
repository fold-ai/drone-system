"use client";

import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { fixed } from "@/lib/format";
import { useSim, writeNode } from "@/lib/store";
import type { ScheduleNode } from "@/lib/types";

/**
 * Throttle schedule as editable points on the mission timeline.
 *
 * Dragging a point vertically changes the commanded throttle, horizontally
 * moves it in time. The curve between points is what the solver flies: linear
 * interpolation, held flat outside the node range.
 */
export function ScheduleEditor({ height = 76 }: { height?: number }) {
  const run = useSim((s) => s.run);
  const spec = useSim((s) => s.spec);
  const setThrottleSchedule = useSim((s) => s.setThrottleSchedule);
  const runNow = useSim((s) => s.run_);
  const host = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);

  const nodes: ScheduleNode[] =
    spec.control.throttle_schedule ?? run?.resolved.throttle_schedule ?? [];
  const tEnd = Math.max(1, run?.t1 ?? run?.resolved.plan.duration_s ?? spec.mission.duration_s);

  const toXY = (n: ScheduleNode) => ({
    x: (n.t / tEnd) * 100,
    y: (1 - n.value) * 100,
  });

  const fromEvent = useCallback(
    (clientX: number, clientY: number) => {
      const el = host.current;
      if (!el) return { t: 0, v: 0 };
      const r = el.getBoundingClientRect();
      return {
        t: Math.min(tEnd, Math.max(0, ((clientX - r.left) / r.width) * tEnd)),
        v: Math.min(1, Math.max(0, 1 - (clientY - r.top) / r.height)),
      };
    },
    [tEnd],
  );

  const onMove = useCallback(
    (e: React.PointerEvent) => {
      if (drag === null) return;
      const { t, v } = fromEvent(e.clientX, e.clientY);
      const next = nodes.map((n, i) => (i === drag ? { t: Math.round(t * 10) / 10, value: v } : n));
      next.sort((a, b) => a.t - b.t);
      setThrottleSchedule(next);
      setDrag(next.findIndex((n) => Math.abs(n.value - v) < 1e-9 && Math.abs(n.t - Math.round(t * 10) / 10) < 1e-9));
    },
    [drag, fromEvent, nodes, setThrottleSchedule],
  );

  const points = nodes.map(toXY);
  const path = points.length
    ? `M ${points.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(" L ")}`
    : "";

  return (
    <div className="flex min-w-0 flex-col">
      <div className="flex items-center justify-between px-3 pt-1.5">
        <span className="text-[10px] uppercase tracking-[0.1em] text-dim">
          Throttle schedule &mdash; {nodes.length} nodes
        </span>
        <div className="flex gap-1.5">
          <Button
            variant="ghost"
            onClick={() => setThrottleSchedule(run?.resolved.throttle_schedule ?? [])}
            disabled={!run}
            title="Discard edits and return to the schedule the sizing calculation produced"
          >
            revert
          </Button>
          <Button variant="primary" onClick={() => void runNow()} title="Re-solve the whole flight">
            apply
          </Button>
        </div>
      </div>
      <div
        ref={host}
        className="relative mx-3 mb-2 mt-1 border border-rule bg-void"
        style={{ height }}
        onPointerMove={onMove}
        onPointerUp={() => setDrag(null)}
        onPointerLeave={() => setDrag(null)}
        onDoubleClick={(e) => {
          const { t, v } = fromEvent(e.clientX, e.clientY);
          setThrottleSchedule(writeNode(nodes, Math.round(t * 10) / 10, v));
        }}
      >
        {[0.25, 0.5, 0.75].map((f) => (
          <div key={f} className="absolute inset-x-0 h-px bg-rule" style={{ top: `${f * 100}%` }} />
        ))}
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          <path d={path} fill="none" stroke="#ffffff" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
        </svg>
        {points.map((p, i) => (
          <button
            key={`${nodes[i].t}-${i}`}
            type="button"
            title={`t+${fixed(nodes[i].t, 1)} s  ${fixed(nodes[i].value * 100, 1)}%  (drag to move, right-click to delete)`}
            onPointerDown={(e) => {
              e.preventDefault();
              setDrag(i);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              if (nodes.length > 2) setThrottleSchedule(nodes.filter((_, k) => k !== i));
            }}
            className="absolute h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 border border-bright bg-void hover:bg-bright"
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
          />
        ))}
      </div>
    </div>
  );
}
