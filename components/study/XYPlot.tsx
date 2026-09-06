"use client";

import { useCallback, useEffect, useRef } from "react";

export interface Series {
  label: string;
  colour: string;
  points: [number, number][];
  dash?: number[];
  width?: number;
}

export interface PointMark {
  x: number;
  y: number;
  label: string;
  colour: string;
  /** Hollow marks read as a reference, filled as the live state. */
  hollow?: boolean;
}

/**
 * Line plot on a canvas.
 *
 * Shares the instrument palette and the axis treatment with the rest of the
 * product. Kept deliberately small: series, optional dashed styling, point
 * marks and an optional line through the origin, which is all the study plots
 * need.
 */
export function XYPlot({
  series,
  height = 200,
  xLabel,
  yLabel,
  marks = [],
  tangent,
  xDomain,
  yDomain,
}: {
  series: Series[];
  height?: number;
  xLabel: string;
  yLabel: string;
  marks?: PointMark[];
  /** A ray from the origin through this point, for the L/D max tangent. */
  tangent?: { x: number; y: number; colour: string; label: string } | null;
  xDomain?: [number, number];
  yDomain?: [number, number];
}) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const c = canvas.current;
    const el = host.current;
    if (!c || !el) return;
    const all = series.flatMap((s) => s.points);
    if (all.length === 0) return;
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
    const padT = 10;
    const padB = 22;
    const x0 = padL;
    const x1 = w - padR;
    const y0 = padT;
    const y1 = height - padB;

    const xs = all.map((p) => p[0]).concat(marks.map((m) => m.x));
    const ys = all.map((p) => p[1]).concat(marks.map((m) => m.y));
    const xlo = xDomain ? xDomain[0] : Math.min(0, ...xs);
    const xhi = xDomain ? xDomain[1] : Math.max(...xs) * 1.05;
    const ylo = yDomain ? yDomain[0] : Math.min(0, ...ys);
    const yhi = yDomain ? yDomain[1] : Math.max(...ys) * 1.08;
    const px = (v: number) => x0 + ((v - xlo) / (xhi - xlo || 1)) * (x1 - x0);
    const py = (v: number) => y1 - ((v - ylo) / (yhi - ylo || 1)) * (y1 - y0);

    g.strokeStyle = "#1c1c1c";
    g.fillStyle = "#6b6b6b";
    g.lineWidth = 1;
    g.font = "10px ui-monospace, monospace";
    g.textAlign = "right";
    g.textBaseline = "middle";
    const ys2 = niceStep(yhi - ylo, 4);
    for (let v = Math.ceil(ylo / ys2) * ys2; v <= yhi; v += ys2) {
      const y = py(v);
      g.beginPath();
      g.moveTo(x0, y);
      g.lineTo(x1, y);
      g.stroke();
      g.fillText(fmt(v), x0 - 4, y);
    }
    g.textAlign = "center";
    g.textBaseline = "top";
    const xs2 = niceStep(xhi - xlo, 5);
    for (let v = Math.ceil(xlo / xs2) * xs2; v <= xhi; v += xs2) {
      const x = px(v);
      g.beginPath();
      g.moveTo(x, y0);
      g.lineTo(x, y1);
      g.stroke();
      g.fillText(fmt(v), x, y1 + 4);
    }

    if (tangent) {
      // The ray from the origin touching the polar: its gradient is L/D max.
      const scale = Math.max(
        (xhi - xlo) / Math.max(1e-9, tangent.x),
        (yhi - ylo) / Math.max(1e-9, tangent.y),
      );
      g.strokeStyle = tangent.colour;
      g.setLineDash([4, 3]);
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(px(0), py(0));
      g.lineTo(px(tangent.x * scale), py(tangent.y * scale));
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = tangent.colour;
      g.textAlign = "left";
      g.textBaseline = "bottom";
      g.fillText(tangent.label, px(tangent.x) + 6, py(tangent.y) - 4);
    }

    for (const s of series) {
      g.strokeStyle = s.colour;
      g.lineWidth = s.width ?? 1.5;
      g.setLineDash(s.dash ?? []);
      g.beginPath();
      s.points.forEach((p, i) => {
        if (i === 0) g.moveTo(px(p[0]), py(p[1]));
        else g.lineTo(px(p[0]), py(p[1]));
      });
      g.stroke();
      g.setLineDash([]);
    }

    for (const m of marks) {
      const x = px(m.x);
      const y = py(m.y);
      g.strokeStyle = m.colour;
      g.fillStyle = m.colour;
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(x, y, 4, 0, Math.PI * 2);
      if (m.hollow) g.stroke();
      else g.fill();
      g.textAlign = x > (x0 + x1) / 2 ? "right" : "left";
      g.textBaseline = "top";
      g.fillText(m.label, x > (x0 + x1) / 2 ? x - 7 : x + 7, y + 3);
    }

    g.strokeStyle = "#1c1c1c";
    g.lineWidth = 1;
    g.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0 - 1, y1 - y0 - 1);
    g.fillStyle = "#6b6b6b";
    g.textAlign = "right";
    g.textBaseline = "bottom";
    g.fillText(xLabel, x1, height - 2);
    g.save();
    g.translate(9, (y0 + y1) / 2);
    g.rotate(-Math.PI / 2);
    g.textAlign = "center";
    g.textBaseline = "top";
    g.fillText(yLabel, 0, 0);
    g.restore();
  }, [series, height, marks, tangent, xLabel, yLabel, xDomain, yDomain]);

  useEffect(() => {
    draw();
    const ro = new ResizeObserver(draw);
    if (host.current) ro.observe(host.current);
    return () => ro.disconnect();
  }, [draw]);

  return (
    <div ref={host} className="w-full" style={{ height }}>
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
  if (a >= 0.01) return v.toFixed(3);
  return v.toExponential(1);
}
