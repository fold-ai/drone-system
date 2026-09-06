"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { css, cssGradient, normalise } from "@/lib/colormap";
import { fixed } from "@/lib/format";
import { readParam, useStudy } from "@/lib/studyStore";
import { STUDY_PARAMS, SWEEP_CONSTRAINTS, SWEEP_MAX_GRID, SWEEP_METRICS } from "@/lib/types";

const PARAMS = Object.entries(STUDY_PARAMS) as [string, { label: string; unit: string }][];
const METRICS = Object.entries(SWEEP_METRICS) as [string, { label: string; unit: string }][];

/** Each constraint gets its own dash so the boundaries stay distinguishable. */
const CONSTRAINT_DASH: number[][] = [[], [5, 3], [2, 3], [7, 3, 2, 3]];

/**
 * Two parameters against a metric, with the constraints drawn on top.
 *
 * The colour is the metric on the shared ramp. The hatched region is where the
 * design stops being buildable, and each constraint boundary is drawn with its
 * own dash so it is clear which one is binding where. A design can be excellent
 * on the metric and still be outside every constraint, which is exactly the
 * situation this view exists to make obvious.
 *
 * Grid resolution is capped and the number of solves is stated before the sweep
 * runs, because every cell is a solve.
 */
export function SweepExplorer() {
  const sweep = useStudy((s) => s.sweep);
  const job = useStudy((s) => s.jobs.sweep);
  const run = useStudy((s) => s.run);
  const spec = useStudy((s) => s.spec);

  const [xPath, setXPath] = useState("airframe.aspect_ratio");
  const [yPath, setYPath] = useState("airframe.cd0_sub");
  const [metric, setMetric] = useState("range_km");
  const [n, setN] = useState(20);
  const [hover, setHover] = useState<{ ix: number; iy: number } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  // Which constraints count toward the feasible region. All on by default; a
  // constraint the baseline violates everywhere is worth being able to set
  // aside so the others can be read.
  const [enabled, setEnabled] = useState<boolean[]>(SWEEP_CONSTRAINTS.map(() => true));
  const mask = enabled.reduce((m, on, i) => (on ? m | (1 << i) : m), 0);

  const canvas = useRef<HTMLCanvasElement>(null);
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (job.phase !== "running") return undefined;
    const t0 = Date.now();
    const id = window.setInterval(() => setElapsed((Date.now() - t0) / 1000), 100);
    return () => window.clearInterval(id);
  }, [job.phase]);

  const go = () => {
    const bx = readParam(spec, xPath);
    const by = readParam(spec, yPath);
    void run("sweep", {
      x_path: xPath,
      x_lo: bx * 0.5,
      x_hi: bx * 1.6,
      y_path: yPath,
      y_lo: by * 0.6,
      y_hi: by * 1.7,
      metric,
      nx: n,
      ny: n,
    });
  };

  const draw = useCallback(() => {
    const c = canvas.current;
    const el = host.current;
    if (!c || !el || !sweep) return;
    const dpr = window.devicePixelRatio || 1;
    const w = el.clientWidth;
    const h = 300;
    if (c.width !== w * dpr || c.height !== h * dpr) {
      c.width = w * dpr;
      c.height = h * dpr;
    }
    const g = c.getContext("2d");
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);

    const padL = 52;
    const padR = 10;
    const padT = 22;
    const padB = 24;
    const x0 = padL;
    const x1 = w - padR;
    const y0 = padT;
    const y1 = h - padB;
    const nx = sweep.x.n;
    const ny = sweep.y.n;
    const cw = (x1 - x0) / nx;
    const ch = (y1 - y0) / ny;

    for (let j = 0; j < ny; j += 1) {
      for (let i = 0; i < nx; i += 1) {
        const v = sweep.values[j][i];
        g.fillStyle = css(normalise(v, sweep.vmin, sweep.vmax));
        // y increases upward on screen
        g.fillRect(x0 + i * cw, y1 - (j + 1) * ch, cw + 0.6, ch + 0.6);
      }
    }

    // Hatch what is not buildable.
    g.save();
    g.beginPath();
    g.rect(x0, y0, x1 - x0, y1 - y0);
    g.clip();
    g.strokeStyle = "rgba(0,0,0,0.4)";
    g.lineWidth = 1;
    for (let j = 0; j < ny; j += 1) {
      for (let i = 0; i < nx; i += 1) {
        if ((sweep.violations[j][i] & mask) === 0) continue;
        const cx = x0 + i * cw;
        const cy = y1 - (j + 1) * ch;
        // Light enough that the metric underneath still reads: the hatch marks
        // the region, it does not replace it.
        g.fillStyle = "rgba(0,0,0,0.30)";
        g.fillRect(cx, cy, cw + 0.6, ch + 0.6);
        g.beginPath();
        for (let d = -ch; d < cw; d += 6) {
          g.moveTo(cx + d, cy + ch);
          g.lineTo(cx + d + ch, cy);
        }
        g.stroke();
      }
    }
    g.restore();

    // Constraint boundaries: segments where a bit flips between neighbours.
    for (let b = 0; b < SWEEP_CONSTRAINTS.length; b += 1) {
      if (!enabled[b]) continue;
      const bit = 1 << b;
      g.strokeStyle = "#ffffff";
      g.lineWidth = 1.4;
      g.setLineDash(CONSTRAINT_DASH[b] ?? []);
      g.beginPath();
      for (let j = 0; j < ny; j += 1) {
        for (let i = 0; i < nx; i += 1) {
          const here = (sweep.violations[j][i] & bit) !== 0;
          const cx = x0 + i * cw;
          const cy = y1 - (j + 1) * ch;
          if (i + 1 < nx && ((sweep.violations[j][i + 1] & bit) !== 0) !== here) {
            g.moveTo(cx + cw, cy);
            g.lineTo(cx + cw, cy + ch);
          }
          if (j + 1 < ny && ((sweep.violations[j + 1][i] & bit) !== 0) !== here) {
            g.moveTo(cx, cy);
            g.lineTo(cx + cw, cy);
          }
        }
      }
      g.stroke();
      g.setLineDash([]);
    }

    if (hover) {
      g.strokeStyle = "#ffffff";
      g.lineWidth = 1.5;
      g.strokeRect(x0 + hover.ix * cw, y1 - (hover.iy + 1) * ch, cw, ch);
    }

    g.strokeStyle = "#1c1c1c";
    g.lineWidth = 1;
    g.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0 - 1, y1 - y0 - 1);

    g.fillStyle = "#6b6b6b";
    g.font = "10px ui-monospace, monospace";
    g.textAlign = "center";
    g.textBaseline = "top";
    for (let i = 0; i <= 4; i += 1) {
      const f = i / 4;
      g.fillText((sweep.x.lo + (sweep.x.hi - sweep.x.lo) * f).toFixed(2), x0 + f * (x1 - x0), y1 + 4);
    }
    g.textAlign = "right";
    g.textBaseline = "middle";
    for (let i = 0; i <= 4; i += 1) {
      const f = i / 4;
      g.fillText(
        (sweep.y.lo + (sweep.y.hi - sweep.y.lo) * f).toPrecision(3),
        x0 - 4,
        y1 - f * (y1 - y0),
      );
    }
    g.textAlign = "right";
    g.textBaseline = "bottom";
    g.fillText(`${sweep.x.label} ${sweep.x.unit}`, x1, h - 2);
    // The y label sits above the axis rather than beside it; rotated in the
    // tick column it collides with the numbers.
    g.textAlign = "left";
    g.textBaseline = "top";
    g.fillText(`${sweep.y.label} ${sweep.y.unit}`, 2, 0);
  }, [sweep, hover, mask, enabled]);

  useEffect(() => {
    draw();
    const ro = new ResizeObserver(draw);
    if (host.current) ro.observe(host.current);
    return () => ro.disconnect();
  }, [draw]);

  const cells = n * n;
  const cell = hover && sweep ? sweep.values[hover.iy][hover.ix] : null;
  const bits = hover && sweep ? sweep.violations[hover.iy][hover.ix] : 0;

  return (
    <Panel title="Sweep explorer">
      <div className="p-2">
        <div className="flex flex-wrap items-center gap-1.5 pb-2">
          <Picker label="x" value={xPath} onChange={setXPath} options={PARAMS} />
          <Picker label="y" value={yPath} onChange={setYPath} options={PARAMS} />
          <Picker label="colour" value={metric} onChange={setMetric} options={METRICS} />
          <label className="flex items-center gap-1 text-[10px] text-dim">
            grid
            <input
              type="number"
              min={4}
              max={SWEEP_MAX_GRID}
              value={n}
              onChange={(e) =>
                setN(Math.max(4, Math.min(SWEEP_MAX_GRID, Number(e.target.value) || 4)))
              }
              className="num w-[46px] text-right text-[11px]"
            />
          </label>
          <span className="num text-[10px] text-dim">
            {cells} cells, about {(cells * 0.0035).toFixed(1)} s
          </span>
          <button
            type="button"
            onClick={go}
            disabled={job.phase === "running" || xPath === yPath}
            className="hit h-6 border border-bright px-2 text-[11px] text-bright hover:bg-bright hover:text-void disabled:opacity-40"
          >
            {job.phase === "running" ? `sweeping ${elapsed.toFixed(1)}s` : "sweep"}
          </button>
          {xPath === yPath && <span className="text-[10px] text-alert">! pick two different axes</span>}
          {sweep && job.phase !== "running" && (
            <span className="num text-[10px] text-dim">
              {sweep.solves} solves in {fixed(sweep.solve_ms, 0)} ms
            </span>
          )}
        </div>

        {job.error && <p className="pb-2 text-[11px] text-alert">! {job.error}</p>}

        {!sweep ? (
          <p className="text-[11px] text-dim">
            Nothing swept yet. {cells} cells is {cells} solves.
          </p>
        ) : (
          <div className="flex gap-2">
            <div
              ref={host}
              className="min-w-0 flex-1"
              style={{ height: 300 }}
              onPointerMove={(e) => {
                const el = host.current;
                if (!el || !sweep) return;
                const r = el.getBoundingClientRect();
                const fx = (e.clientX - r.left - 52) / Math.max(1, r.width - 62);
                const fy = (r.height - 24 - (e.clientY - r.top)) / Math.max(1, r.height - 34);
                const ix = Math.floor(Math.min(0.999, Math.max(0, fx)) * sweep.x.n);
                const iy = Math.floor(Math.min(0.999, Math.max(0, fy)) * sweep.y.n);
                setHover({ ix, iy });
              }}
              onPointerLeave={() => setHover(null)}
            >
              <canvas ref={canvas} className="block h-full w-full" />
            </div>

            <div className="w-[152px] shrink-0">
              <div className="flex h-[164px] gap-1.5">
                <div className="w-3" style={{ background: cssGradient("to top") }} />
                <div className="flex flex-col justify-between py-px text-[9px] text-dim">
                  <span className="num">{fixed(sweep.vmax, 1)}</span>
                  <span className="num">{fixed(sweep.vmin, 1)}</span>
                </div>
                <div className="text-[9px] leading-tight text-dim">
                  {sweep.metric_label}
                  <br />
                  {sweep.metric_unit}
                </div>
              </div>

              <div className="mt-2 space-y-0.5">
                {SWEEP_CONSTRAINTS.map((c, i) => {
                  const binds = sweep
                    ? sweep.violations.some((row) => row.some((v) => v & (1 << i)))
                    : false;
                  const all =
                    sweep && sweep.violations.every((row) => row.every((v) => v & (1 << i)));
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() =>
                        setEnabled(enabled.map((on, k) => (k === i ? !on : on)))
                      }
                      title={
                        all
                          ? "Violated by every cell on these axes, so it does not discriminate here. Switch it off to read the others."
                          : binds
                            ? "Binding somewhere on these axes"
                            : "Satisfied everywhere on these axes"
                      }
                      className={`hit flex w-full items-center gap-1.5 text-left text-[9px] ${
                        enabled[i] ? "text-dim" : "text-dim/40 line-through"
                      } hover:text-bright`}
                    >
                      <svg width="18" height="6" aria-hidden className="shrink-0">
                        <line
                          x1="0"
                          y1="3"
                          x2="18"
                          y2="3"
                          stroke={enabled[i] ? "#ffffff" : "#3a3a3a"}
                          strokeWidth="1.4"
                          strokeDasharray={(CONSTRAINT_DASH[i] ?? []).join(" ") || undefined}
                        />
                      </svg>
                      <span className={bits & (1 << i) ? "text-alert" : ""}>{c}</span>
                      {all && <span className="ml-auto shrink-0 text-alert">all</span>}
                    </button>
                  );
                })}
                <div className="flex items-center gap-1.5 pt-0.5 text-[9px] text-dim">
                  <span className="inline-block h-3 w-[18px] border border-rule bg-black/50" />
                  not buildable
                </div>
              </div>

              {hover && cell !== null && (
                <div className="mt-2 border border-rule p-1.5">
                  <div className="num text-[12px] text-bright">
                    {fixed(cell, 2)}
                    <span className="ml-1 text-[9px] text-dim">{sweep.metric_unit}</span>
                  </div>
                  <div className="num text-[9px] text-dim">
                    {sweep.x.label}{" "}
                    {fixed(
                      sweep.x.lo + ((sweep.x.hi - sweep.x.lo) * hover.ix) / (sweep.x.n - 1),
                      3,
                    )}
                  </div>
                  <div className="num text-[9px] text-dim">
                    {sweep.y.label}{" "}
                    {fixed(
                      sweep.y.lo + ((sweep.y.hi - sweep.y.lo) * hover.iy) / (sweep.y.n - 1),
                      4,
                    )}
                  </div>
                  <div className={`text-[9px] ${bits ? "text-alert" : "text-dim"}`}>
                    {bits
                      ? `! ${SWEEP_CONSTRAINTS.filter((_, i) => bits & (1 << i)).join(", ")}`
                      : "within every constraint"}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {sweep && (
          <>
            <p className="mt-2 text-[10px] leading-snug text-dim">
              {(() => {
                const total = sweep.x.n * sweep.y.n;
                const ok = sweep.violations.reduce(
                  (n, row) => n + row.filter((v) => (v & mask) === 0).length,
                  0,
                );
                if (ok > 0) return `${ok} of ${total} cells satisfy every enabled constraint.`;
                const always = SWEEP_CONSTRAINTS.filter(
                  (_, i) =>
                    enabled[i] &&
                    sweep.violations.every((row) => row.every((v) => v & (1 << i))),
                );
                if (always.length === 0) {
                  return "No cell on these axes satisfies every enabled constraint.";
                }
                return `No cell on these axes satisfies every enabled constraint. ${always.join(
                  " and ",
                )} ${always.length > 1 ? "are" : "is"} violated in every cell, so ${
                  always.length > 1 ? "they do" : "it does"
                } not discriminate here; switch ${
                  always.length > 1 ? "them" : "it"
                } off to read the rest.`;
              })()}
            </p>
            <p className="mt-1 text-[10px] leading-snug text-dim">{sweep.note}</p>
          </>
        )}
      </div>
    </Panel>
  );
}

function Picker({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, { label: string; unit: string }][];
}) {
  return (
    <label className="flex items-center gap-1 text-[10px] text-dim">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-6 border border-rule bg-void px-1 text-[10px] text-bright"
      >
        {options.map(([k, v]) => (
          <option key={k} value={k}>
            {v.label}
          </option>
        ))}
      </select>
    </label>
  );
}
