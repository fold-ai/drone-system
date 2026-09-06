"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface Band {
  key: string;
  label: string;
  colour: string;
  /** Value of this band at each x, already in the units the readout shows. */
  values: number[];
}

export interface Cursor {
  index: number;
  x: number;
}

/**
 * Stacked area with a tracking cursor.
 *
 * Drawn on a canvas rather than through a chart library: the bands have to
 * stack exactly, the cursor has to read every component at once, and the whole
 * thing has to sit inside the instrument palette. Hover moves the cursor;
 * leaving the plot returns it to wherever the caller pinned it.
 */
export function StackedArea({
  x,
  bands,
  height = 220,
  xLabel,
  yLabel,
  markers = [],
  onCursor,
  pinnedIndex,
}: {
  x: number[];
  bands: Band[];
  height?: number;
  xLabel: string;
  yLabel: string;
  markers?: { x: number; label: string; colour: string }[];
  onCursor?: (c: Cursor | null) => void;
  pinnedIndex?: number | null;
}) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const active = hover ?? pinnedIndex ?? null;

  const draw = useCallback(() => {
    const c = canvas.current;
    const el = host.current;
    if (!c || !el || x.length === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const w = el.clientWidth;
    if (c.width !== w * dpr || c.height !== height * dpr) {
      c.width = w * dpr;
      c.height = height * dpr;
    }
    const g = c.getContext("2d");
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, height);

    const padL = 46;
    const padR = 10;
    const padT = 8;
    const padB = 22;
    const x0 = padL;
    const x1 = w - padR;
    const y0 = padT;
    const y1 = height - padB;

    const totals = x.map((_, i) => bands.reduce((s, b) => s + (b.values[i] ?? 0), 0));
    const vmax = Math.max(1e-9, ...totals) * 1.08;
    const px = (v: number) => x0 + ((v - x[0]) / (x[x.length - 1] - x[0] || 1)) * (x1 - x0);
    const py = (v: number) => y1 - (v / vmax) * (y1 - y0);

    // grid
    g.strokeStyle = "#1c1c1c";
    g.fillStyle = "#6b6b6b";
    g.lineWidth = 1;
    g.font = "10px ui-monospace, monospace";
    g.textAlign = "right";
    g.textBaseline = "middle";
    const step = niceStep(vmax, 4);
    for (let v = 0; v <= vmax; v += step) {
      const y = py(v);
      g.beginPath();
      g.moveTo(x0, y);
      g.lineTo(x1, y);
      g.stroke();
      g.fillText(fmt(v), x0 - 4, y);
    }
    g.textAlign = "center";
    g.textBaseline = "top";
    const xStep = niceStep(x[x.length - 1] - x[0], 5);
    for (let v = Math.ceil(x[0] / xStep) * xStep; v <= x[x.length - 1] + 1e-9; v += xStep) {
      const xp = px(v);
      g.beginPath();
      g.moveTo(xp, y0);
      g.lineTo(xp, y1);
      g.stroke();
      g.fillText(fmt(v), xp, y1 + 4);
    }

    // stacked bands, bottom up
    const base = new Array(x.length).fill(0);
    for (const b of bands) {
      g.beginPath();
      g.moveTo(px(x[0]), py(base[0]));
      for (let i = 0; i < x.length; i += 1) g.lineTo(px(x[i]), py(base[i] + (b.values[i] ?? 0)));
      for (let i = x.length - 1; i >= 0; i -= 1) g.lineTo(px(x[i]), py(base[i]));
      g.closePath();
      g.fillStyle = b.colour;
      g.globalAlpha = 0.82;
      g.fill();
      g.globalAlpha = 1;
      g.strokeStyle = b.colour;
      g.lineWidth = 1;
      g.beginPath();
      for (let i = 0; i < x.length; i += 1) {
        const yv = py(base[i] + (b.values[i] ?? 0));
        if (i === 0) g.moveTo(px(x[i]), yv);
        else g.lineTo(px(x[i]), yv);
      }
      g.stroke();
      for (let i = 0; i < x.length; i += 1) base[i] += b.values[i] ?? 0;
    }

    for (const m of markers) {
      if (m.x < x[0] || m.x > x[x.length - 1]) continue;
      const xp = px(m.x);
      g.strokeStyle = m.colour;
      g.setLineDash([3, 3]);
      g.beginPath();
      g.moveTo(xp, y0);
      g.lineTo(xp, y1);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = m.colour;
      g.textAlign = "left";
      g.textBaseline = "top";
      g.fillText(m.label, xp + 3, y0 + 1);
    }

    if (active !== null && active >= 0 && active < x.length) {
      const xp = px(x[active]);
      g.strokeStyle = "#ffffff";
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(xp, y0);
      g.lineTo(xp, y1);
      g.stroke();
    }

    g.strokeStyle = "#1c1c1c";
    g.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0 - 1, y1 - y0 - 1);
    // Axis labels sit in the corners; centred they collide with a tick.
    g.fillStyle = "#6b6b6b";
    g.textAlign = "right";
    g.textBaseline = "bottom";
    g.fillText(xLabel, x1, height - 2);
    g.save();
    g.translate(9, (y0 + y1) / 2);
    g.rotate(-Math.PI / 2);
    g.textBaseline = "top";
    g.fillText(yLabel, 0, 0);
    g.restore();
  }, [x, bands, height, markers, active, xLabel, yLabel]);

  useEffect(() => {
    draw();
    const ro = new ResizeObserver(draw);
    if (host.current) ro.observe(host.current);
    return () => ro.disconnect();
  }, [draw]);

  return (
    <div
      ref={host}
      className="relative w-full"
      style={{ height }}
      onPointerMove={(e) => {
        const el = host.current;
        if (!el || x.length === 0) return;
        const r = el.getBoundingClientRect();
        const f = (e.clientX - r.left - 46) / Math.max(1, r.width - 56);
        const i = Math.round(Math.min(1, Math.max(0, f)) * (x.length - 1));
        setHover(i);
        onCursor?.({ index: i, x: x[i] });
      }}
      onPointerLeave={() => {
        setHover(null);
        onCursor?.(null);
      }}
    >
      <canvas ref={canvas} className="block h-full w-full border border-rule bg-void" />
    </div>
  );
}

function niceStep(range: number, target: number): number {
  if (!Number.isFinite(range) || range <= 0) return 1;
  const raw = range / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  return (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
}

function fmt(v: number): string {
  const a = Math.abs(v);
  if (a < 1e-9) return "0";
  if (a >= 1000) return v.toFixed(0);
  if (a >= 10) return v.toFixed(0);
  if (a >= 1) return v.toFixed(1);
  return v.toFixed(2);
}
