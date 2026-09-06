"use client";

import { useEffect, useRef, useState } from "react";
import { feasibility } from "@/app/api-client";
import { css } from "@/lib/colormap";
import { EmptyState } from "@/components/panels/ErrorPanel";
import { Panel } from "@/components/ui/Panel";
import { fixed, sci, signed } from "@/lib/format";
import { sampleAt } from "@/lib/playback";
import { useSim } from "@/lib/store";
import type { MachSweepPoint } from "@/lib/types";

/**
 * Aerodynamics, live against the playback cursor.
 *
 * The bold element is the thrust-against-drag plot: the crossing of the two
 * curves is the maximum level speed, and how far short of Mach 1 it falls is
 * the answer this whole tool exists to give.
 */
export function AeroPanel({ detached = false }: { detached?: boolean }) {
  const run = useSim((s) => s.run);
  const setAeroDetached = useSim((s) => s.setAeroDetached);
  const aeroDetached = useSim((s) => s.aeroDetached);

  if (!run) {
    return (
      <Panel title="Aerodynamics">
        <EmptyState where="aero" />
      </Panel>
    );
  }

  return (
    <Panel
      title="Aerodynamics"
      right={
        !detached && (
          <button
            type="button"
            onClick={() => {
              const w = window.open(
                "/aero",
                "act1-aero",
                "width=520,height=940,menubar=no,toolbar=no,location=no,status=no",
              );
              if (w) setAeroDetached(true);
            }}
            className="hit text-[10px] text-dim hover:text-bright"
            title="Open on a second monitor. Playback stays in sync."
          >
            {aeroDetached ? "[reopen]" : "[detach]"}
          </button>
        )
      }
      scroll
    >
      <AeroBody />
    </Panel>
  );
}

export function AeroBody() {
  const run = useSim((s) => s.run);
  const sweep = useLiveSweep();

  const refs = {
    mach: useRef<HTMLSpanElement>(null),
    q: useRef<HTMLSpanElement>(null),
    cl: useRef<HTMLSpanElement>(null),
    cd: useRef<HTMLSpanElement>(null),
    ld: useRef<HTMLSpanElement>(null),
    margin: useRef<HTMLSpanElement>(null),
    ps: useRef<HTMLSpanElement>(null),
    thrust: useRef<HTMLSpanElement>(null),
    drag: useRef<HTMLSpanElement>(null),
    alt: useRef<HTMLSpanElement>(null),
    mass: useRef<HTMLSpanElement>(null),
    tas: useRef<HTMLSpanElement>(null),
    re: useRef<HTMLSpanElement>(null),
    roc: useRef<HTMLSpanElement>(null),
    n: useRef<HTMLSpanElement>(null),
    sm: useRef<HTMLSpanElement>(null),
  };
  const bar = {
    cd0: useRef<HTMLDivElement>(null),
    cdi: useRef<HTMLDivElement>(null),
    wave: useRef<HTMLDivElement>(null),
    cd0n: useRef<HTMLSpanElement>(null),
    cdin: useRef<HTMLSpanElement>(null),
    waven: useRef<HTMLSpanElement>(null),
  };
  const flags = useRef<HTMLDivElement>(null);
  const reNote = useRef<HTMLParagraphElement>(null);
  const dot = useRef<{ mach: number; thrust: number; drag: number }>({ mach: 0, thrust: 0, drag: 0 });
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!run) return undefined;
    const set = (r: React.RefObject<HTMLSpanElement | null>, v: string) => {
      if (r.current) r.current.textContent = v;
    };
    const read = (t: number) => {
      const s = sampleAt(run, t);
      set(refs.mach, fixed(s.mach, 3, 6));
      set(refs.q, fixed(s.q_pa / 1000, 2, 6));
      set(refs.cl, fixed(s.cl, 4, 7));
      set(refs.cd, fixed(s.cd, 5, 7));
      set(refs.ld, fixed(s.ld, 2, 6));
      set(refs.margin, signed(s.thrust_margin_n, 1, 7));
      set(refs.ps, signed(s.ps_ms, 2, 7));
      set(refs.thrust, fixed(s.thrust_n, 1, 6));
      set(refs.drag, fixed(s.drag_n, 1, 6));
      set(refs.alt, fixed(s.h_m, 0, 5));
      set(refs.mass, fixed(s.mass_kg, 3, 6));
      set(refs.tas, fixed(s.v_tas_ms, 1, 6));
      set(refs.re, sci(s.reynolds, 3));
      set(refs.roc, signed(s.roc_ms, 1, 6));
      set(refs.n, fixed(s.load_factor, 2, 5));
      set(refs.sm, fixed(s.static_margin * 100, 2, 6));

      const total = Math.max(1e-9, s.cd);
      if (bar.cd0.current) bar.cd0.current.style.width = `${((s.cd0 - s.cd_wave) / total) * 100}%`;
      if (bar.cdi.current) bar.cdi.current.style.width = `${(s.cdi / total) * 100}%`;
      if (bar.wave.current) bar.wave.current.style.width = `${(s.cd_wave / total) * 100}%`;
      set(bar.cd0n, fixed(s.cd0 - s.cd_wave, 5, 7));
      set(bar.cdin, fixed(s.cdi, 5, 7));
      set(bar.waven, fixed(s.cd_wave, 5, 7));

      if (flags.current) {
        const parts: string[] = [];
        if (s.wave_drag_active) parts.push("WAVE DRAG");
        if (s.lift_limited) parts.push("LIFT LIMITED");
        if (s.stall_limited) parts.push("STALL");
        flags.current.textContent = parts.join("   ");
        flags.current.className = `num h-4 text-[11px] tracking-[0.12em] ${
          parts.length ? "text-alert" : "text-dim"
        }`;
        if (parts.length) flags.current.textContent = `! ${parts.join("   ")}`;
      }
      if (reNote.current) {
        reNote.current.style.display = s.reynolds < 5e5 && s.reynolds > 0 ? "block" : "none";
      }
      dot.current = { mach: s.mach, thrust: s.thrust_n, drag: s.drag_n };
      draw();
    };

    const draw = () => {
      const c = canvas.current;
      if (!c || !sweep) return;
      const dpr = window.devicePixelRatio || 1;
      const w = c.clientWidth;
      const h = c.clientHeight;
      if (c.width !== w * dpr || c.height !== h * dpr) {
        c.width = w * dpr;
        c.height = h * dpr;
      }
      const g = c.getContext("2d");
      if (!g) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      paintCrossing(g, w, h, sweep.points, sweep.machDd, dot.current);
    };

    read(useSim.getState().t);
    const un = useSim.subscribe((s) => read(s.t));
    const ro = new ResizeObserver(draw);
    if (canvas.current) ro.observe(canvas.current);
    return () => {
      un();
      ro.disconnect();
    };
  }, [run, sweep]);

  if (!run) return null;
  const m1 = sweep?.mach1 ?? run.mach1;

  return (
    <div className="pb-4">
      {/* ---- the bold element ------------------------------------------- */}
      <div className="px-3 pt-3">
        <div className="flex items-baseline justify-between">
          <h3 className="tracked text-[10px] text-bright">Thrust available / drag required</h3>
          <span className="num text-[10px] text-dim">
            {sweep ? `${fixed(sweep.altitude, 0)} m  ${fixed(sweep.mass, 2)} kg` : "..."}
          </span>
        </div>
        <canvas ref={canvas} className="mt-1.5 h-[210px] w-full border border-rule bg-void" />
        <div className="mt-1 flex justify-between text-[10px] text-dim">
          <span>Crossing = maximum level speed</span>
          <span className="num text-bright">
            M {fixed(m1.max_level_mach, 3)} &nbsp;/&nbsp; {fixed(m1.max_level_tas_ms, 0)} m/s
          </span>
        </div>
      </div>

      {/* ---- Mach 1 deficit ---------------------------------------------- */}
      <div className="mx-3 mt-3 border border-rule">
        <div className="rule-b px-2 py-1 text-[10px] uppercase tracking-[0.1em] text-dim">
          Mach 1 deficit
        </div>
        <div className="grid grid-cols-3 gap-px bg-rule">
          <Cell label="required" value={fixed(m1.thrust_required_n, 0)} unit="N" />
          <Cell label="available" value={fixed(m1.thrust_available_n, 0)} unit="N" />
          <Cell label="shortfall" value={fixed(m1.deficit_n, 0)} unit="N" alert glyph="!" />
        </div>
        <p className="px-2 py-1.5 text-[10px] leading-snug text-dim">{m1.note}</p>
      </div>

      {/* ---- live state --------------------------------------------------- */}
      <div className="px-3 pt-3">
        <div ref={flags} className="num h-4 text-[11px] tracking-[0.12em] text-dim" />
        <div className="mt-1 space-y-0.5">
          <Row label="Mach" r={refs.mach} unit="M" />
          <Row label="Dynamic pressure" r={refs.q} unit="kPa" />
          <Row label="True airspeed" r={refs.tas} unit="m/s" />
          <Row label="Altitude" r={refs.alt} unit="m" />
          <Row label="Mass" r={refs.mass} unit="kg" />
        </div>
      </div>

      <div className="px-3 pt-3">
        <h3 className="tracked text-[10px] text-dim">Polar</h3>
        <div className="mt-1 space-y-0.5">
          <Row label="CL" r={refs.cl} />
          <Row label="CD" r={refs.cd} />
          <Row label="L/D" r={refs.ld} />
        </div>
        {/* Stacked drag: components are quantities, so they take ramp colours.
            Red stays out of it and is reserved for the exceedance flags above. */}
        <div className="mt-2 flex h-3 w-full border border-rule">
          <div ref={bar.cd0} className="h-full" style={{ width: "60%", background: css(0.24) }} />
          <div ref={bar.cdi} className="h-full" style={{ width: "30%", background: css(0.5) }} />
          <div ref={bar.wave} className="h-full" style={{ width: "0%", background: css(0.92) }} />
        </div>
        <div className="mt-1 space-y-0.5">
          <LegendRow colour={css(0.24)} label="CD0 parasite" r={bar.cd0n} />
          <LegendRow colour={css(0.5)} label="CD induced" r={bar.cdin} />
          <LegendRow colour={css(0.92)} label="CD wave" r={bar.waven} />
        </div>
      </div>

      <div className="px-3 pt-3">
        <h3 className="tracked text-[10px] text-dim">Energy state</h3>
        <div className="mt-1 space-y-0.5">
          <Row label="Thrust" r={refs.thrust} unit="N" />
          <Row label="Drag" r={refs.drag} unit="N" />
          <Row label="Thrust margin  T-D" r={refs.margin} unit="N" />
          <Row label="Specific excess power" r={refs.ps} unit="m/s" />
          <Row label="Rate of climb" r={refs.roc} unit="m/s" />
          <Row label="Load factor" r={refs.n} unit="g" />
          <Row label="Static margin" r={refs.sm} unit="% MAC" />
          <Row label="Reynolds" r={refs.re} />
        </div>
        <p
          ref={reNote}
          className="mt-2 hidden border border-alert px-2 py-1.5 text-[10px] leading-snug text-alert"
        >
          Reynolds number below 5e5. Low-Reynolds separation is not in this drag polar; CD0 and
          CL_max are optimistic here.
        </p>
      </div>

      <div className="px-3 pt-3">
        <h3 className="tracked text-[10px] text-dim">Divergence</h3>
        <div className="mt-1 space-y-0.5">
          <StaticRow label="M_dd" value={fixed(run.spec.airframe.mach_dd, 3)} />
          <StaticRow label="Wave increment" value={fixed(run.spec.airframe.dcd_wave, 4)} />
          <StaticRow
            label="Crossed in this run"
            value={run.summary.wave_drag_entered ? "YES" : "no"}
            alert={run.summary.wave_drag_entered}
          />
          <StaticRow label="Max Mach flown" value={fixed(run.summary.max_mach, 4)} />
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  r,
  unit,
}: {
  label: string;
  r: React.RefObject<HTMLSpanElement | null>;
  unit?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="truncate text-[11px] text-dim">{label}</span>
      <span className="flex shrink-0 items-baseline gap-1">
        <span ref={r} className="num text-[12px]">
          --
        </span>
        <span className="w-10 shrink-0 text-[10px] text-dim">{unit ?? ""}</span>
      </span>
    </div>
  );
}

function LegendRow({
  colour,
  label,
  r,
}: {
  colour: string;
  label: string;
  r: React.RefObject<HTMLSpanElement | null>;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="flex items-center gap-1.5 text-[11px] text-dim">
        <span className="inline-block h-2 w-2" style={{ background: colour }} />
        {label}
      </span>
      <span ref={r} className="num text-[11px]">
        --
      </span>
    </div>
  );
}

function StaticRow({ label, value, alert = false }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="truncate text-[11px] text-dim">{label}</span>
      <span className={`num text-[12px] ${alert ? "text-alert" : ""}`}>{value}</span>
    </div>
  );
}

function Cell({
  label,
  value,
  unit,
  alert = false,
  glyph,
}: {
  label: string;
  value: string;
  unit: string;
  alert?: boolean;
  glyph?: string;
}) {
  return (
    <div className="bg-panel px-2 py-1.5">
      <div className="text-[10px] text-dim">{label}</div>
      <div className={`num text-[15px] ${alert ? "text-alert" : "text-bright"}`}>
        {/* An exceedance always carries a glyph as well as the colour, so it
            survives being read without hue. */}
        {glyph && <span className="mr-1">{glyph}</span>}
        {value}
        <span className="ml-1 text-[10px] text-dim">{unit}</span>
      </div>
    </div>
  );
}

interface Sweep {
  points: MachSweepPoint[];
  machDd: number;
  mach1: ReturnType<typeof Object> & import("@/lib/types").Mach1Deficit;
  altitude: number;
  mass: number;
}

/**
 * Thrust and drag curves for the aircraft's current altitude and mass.
 *
 * Both are properties of the flight condition, so the curves must follow the
 * cursor. A new sweep is fetched only when the condition has actually moved -
 * 150 m of altitude or 150 g of mass - which is a handful of calls across a
 * whole playback rather than one per frame.
 */
function useLiveSweep(): Sweep | null {
  const run = useSim((s) => s.run);
  const [sweep, setSweep] = useState<Sweep | null>(null);
  const pending = useRef<{ alt: number; mass: number } | null>(null);
  const inflight = useRef(false);

  useEffect(() => {
    if (!run) {
      setSweep(null);
      return undefined;
    }
    setSweep({
      points: run.machSweep,
      machDd: run.spec.airframe.mach_dd,
      mach1: run.mach1,
      altitude: run.spec.mission.cruise_altitude_m,
      mass: run.derived.gross_mass_kg - 0.5 * run.summary.fuel_loaded_kg,
    });

    const fetchFor = async (alt: number, mass: number) => {
      inflight.current = true;
      try {
        const res = await feasibility(run.spec, { sweep_altitude_m: alt, sweep_mass_kg: mass });
        setSweep({
          points: res.mach_sweep,
          machDd: run.spec.airframe.mach_dd,
          mach1: res.mach1,
          altitude: res.sweep_altitude_m,
          mass: res.sweep_mass_kg,
        });
      } catch {
        /* keep the previous curves rather than blanking the plot */
      } finally {
        inflight.current = false;
        const next = pending.current;
        pending.current = null;
        if (next) void fetchFor(next.alt, next.mass);
      }
    };

    let lastAlt = Number.NaN;
    let lastMass = Number.NaN;
    const un = useSim.subscribe((s) => {
      const r = s.run;
      if (!r?.cols.h_m || !r.cols.mass_kg) return;
      const i = Math.min(r.n - 1, Math.max(0, Math.round((s.t - r.t0) / 0.02)));
      const alt = Math.round(r.cols.h_m[i] / 150) * 150;
      const mass = Math.round(r.cols.mass_kg[i] / 0.15) * 0.15;
      if (alt === lastAlt && mass === lastMass) return;
      lastAlt = alt;
      lastMass = mass;
      if (inflight.current) pending.current = { alt, mass };
      else void fetchFor(alt, mass);
    });
    return un;
  }, [run]);

  return sweep;
}

/**
 * Thrust available against drag required.
 *
 * The bold element of the console, and the one plot that answers the question
 * the tool exists for. Thrust is green and drag is amber-yellow from the shared
 * ramp, the crossing is marked in cyan, and the drag-divergence region is
 * shaded so the cost of pushing past M_dd is visible rather than inferred.
 * Neither curve is identified by colour alone: both are labelled on the plot.
 */
function paintCrossing(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  pts: MachSweepPoint[],
  machDd: number,
  dot: { mach: number; thrust: number; drag: number },
) {
  if (!pts.length) return;
  const padL = 34;
  const padR = 8;
  const padT = 10;
  const padB = 18;
  const x0 = padL;
  const x1 = w - padR;
  const y0 = padT;
  const y1 = h - padB;

  const THRUST = css(0.58);
  const DRAG = css(0.86);
  const CROSS = css(0.44);

  const mLo = pts[0].mach;
  const mHi = pts[pts.length - 1].mach;
  let fMax = 0;
  for (const p of pts) fMax = Math.max(fMax, p.thrust_available_n, Math.min(p.drag_required_n, 1200));
  fMax = Math.max(fMax, dot.thrust, dot.drag) * 1.12;

  const px = (m: number) => x0 + ((m - mLo) / (mHi - mLo)) * (x1 - x0);
  const py = (f: number) => y1 - (Math.max(0, f) / fMax) * (y1 - y0);

  // Drag-divergence region, shaded amber.
  if (machDd < mHi) {
    const xd = px(Math.max(mLo, machDd));
    const grad = g.createLinearGradient(xd, 0, x1, 0);
    grad.addColorStop(0, "rgba(232,134,46,0.0)");
    grad.addColorStop(1, "rgba(232,134,46,0.16)");
    g.fillStyle = grad;
    g.fillRect(xd, y0, x1 - xd, y1 - y0);
  }

  g.lineWidth = 1;
  g.strokeStyle = "#1c1c1c";
  g.fillStyle = "#6b6b6b";
  g.font = "10px ui-monospace, monospace";
  g.textAlign = "right";
  g.textBaseline = "middle";
  const fStep = niceStep(fMax, 4);
  for (let f = 0; f <= fMax; f += fStep) {
    const y = py(f);
    g.beginPath();
    g.moveTo(x0, y);
    g.lineTo(x1, y);
    g.stroke();
    g.fillText(String(Math.round(f)), x0 - 4, y);
  }
  g.textAlign = "center";
  g.textBaseline = "top";
  for (let m = Math.ceil(mLo * 10) / 10; m <= mHi + 1e-9; m += 0.2) {
    const x = px(m);
    g.beginPath();
    g.moveTo(x, y0);
    g.lineTo(x, y1);
    g.stroke();
    g.fillText(m.toFixed(1), x, y1 + 4);
  }

  if (machDd >= mLo && machDd <= mHi) {
    const x = px(machDd);
    g.strokeStyle = css(0.9);
    g.setLineDash([2, 3]);
    g.beginPath();
    g.moveTo(x, y0);
    g.lineTo(x, y1);
    g.stroke();
    g.setLineDash([]);
    g.textAlign = "left";
    g.fillStyle = css(0.9);
    g.fillText("M_dd", x + 3, y0 + 1);
    g.fillStyle = "#6b6b6b";
  }

  const curve = (
    key: "thrust_available_n" | "drag_required_n",
    stroke: string,
    dash: number[],
  ) => {
    g.strokeStyle = stroke;
    g.lineWidth = 1.6;
    g.setLineDash(dash);
    g.beginPath();
    pts.forEach((p, i) => {
      const y = py(p[key]);
      if (i === 0) g.moveTo(px(p.mach), y);
      else g.lineTo(px(p.mach), Math.max(y0 - 40, y));
    });
    g.stroke();
    g.setLineDash([]);
  };
  curve("drag_required_n", DRAG, [5, 3]);
  curve("thrust_available_n", THRUST, []);

  // Label both curves on the plot: colour is a channel, never the only channel.
  g.font = "10px ui-monospace, monospace";
  g.textBaseline = "middle";
  g.textAlign = "left";
  const tEnd = pts[Math.min(pts.length - 1, Math.floor(pts.length * 0.18))];
  g.fillStyle = THRUST;
  g.fillText("thrust available", px(tEnd.mach) + 4, py(tEnd.thrust_available_n) - 9);
  g.fillStyle = DRAG;
  const dEnd = pts[Math.floor(pts.length * 0.78)];
  g.textAlign = "right";
  g.fillText("drag required", px(dEnd.mach) - 4, Math.max(y0 + 8, py(dEnd.drag_required_n)));

  // Crossing: the maximum level speed.
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1];
    const b = pts[i];
    if (a.excess_n > 0 && b.excess_n <= 0) {
      const f = a.excess_n / (a.excess_n - b.excess_n);
      const m = a.mach + f * (b.mach - a.mach);
      const t = a.thrust_available_n + f * (b.thrust_available_n - a.thrust_available_n);
      const x = px(m);
      const y = py(t);
      g.strokeStyle = CROSS;
      g.lineWidth = 1;
      g.setLineDash([3, 2]);
      g.beginPath();
      g.moveTo(x, y0);
      g.lineTo(x, y1);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = CROSS;
      g.beginPath();
      g.arc(x, y, 3.5, 0, Math.PI * 2);
      g.fill();
      g.textAlign = m > (mLo + mHi) / 2 ? "right" : "left";
      g.textBaseline = "top";
      g.fillText(`M ${m.toFixed(3)}`, m > (mLo + mHi) / 2 ? x - 4 : x + 4, y0 + 1);
      break;
    }
  }

  // Current flight condition.
  if (dot.mach >= mLo && dot.mach <= mHi) {
    const x = px(dot.mach);
    g.strokeStyle = "#000000";
    g.lineWidth = 2.5;
    g.fillStyle = THRUST;
    g.beginPath();
    g.arc(x, py(dot.thrust), 4.5, 0, Math.PI * 2);
    g.stroke();
    g.fill();
    g.fillStyle = DRAG;
    g.beginPath();
    g.arc(x, py(dot.drag), 4.5, 0, Math.PI * 2);
    g.stroke();
    g.fill();
  }

  g.strokeStyle = "#1c1c1c";
  g.lineWidth = 1;
  g.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0 - 1, y1 - y0 - 1);
}

function niceStep(range: number, target: number): number {
  const raw = range / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10;
  return step * mag;
}
