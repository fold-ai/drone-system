"use client";

import { useCallback, useEffect, useRef } from "react";
import { Button, Segment } from "@/components/ui/Button";
import { clock, fixed } from "@/lib/format";
import { indexAt } from "@/lib/playback";
import { SPEEDS, useSim } from "@/lib/store";

const PHASE_LABEL = ["rail", "climb", "cruise", "descent"];

/**
 * Scrub bar. Phase bands come from the trajectory's own phase column, event
 * ticks from the solver's event list. The cursor is moved directly rather than
 * re-rendered, so scrubbing stays smooth over fifteen thousand samples.
 */
export function Timeline() {
  const run = useSim((s) => s.run);
  const playing = useSim((s) => s.playing);
  const speed = useSim((s) => s.speed);
  const setT = useSim((s) => s.setT);
  const toggle = useSim((s) => s.toggle);
  const setSpeed = useSim((s) => s.setSpeed);
  const setScrubbing = useSim((s) => s.setScrubbing);
  const spliceStatus = useSim((s) => s.spliceStatus);

  const track = useRef<HTMLDivElement>(null);
  const cursor = useRef<HTMLDivElement>(null);
  const readout = useRef<HTMLSpanElement>(null);
  const dragging = useRef(false);

  const span = run ? Math.max(1e-6, run.t1 - run.t0) : 1;

  useEffect(() => {
    const place = (t: number) => {
      if (cursor.current) {
        const f = run ? (t - run.t0) / span : 0;
        cursor.current.style.left = `${(Math.min(1, Math.max(0, f)) * 100).toFixed(4)}%`;
      }
      if (readout.current) readout.current.textContent = clock(t);
    };
    place(useSim.getState().t);
    return useSim.subscribe((s) => place(s.t));
  }, [run, span]);

  const seek = useCallback(
    (clientX: number) => {
      const el = track.current;
      if (!el || !run) return;
      const r = el.getBoundingClientRect();
      const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
      setT(run.t0 + f * span);
    },
    [run, setT, span],
  );

  useEffect(() => {
    const move = (e: PointerEvent) => dragging.current && seek(e.clientX);
    const up = () => {
      if (!dragging.current) return;
      dragging.current = false;
      setScrubbing(false);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [seek, setScrubbing]);

  // phase bands, derived from the solved trajectory
  const bands: { from: number; to: number; phase: number }[] = [];
  if (run?.cols.phase && run.cols.t) {
    const ph = run.cols.phase;
    const ts = run.cols.t;
    let start = 0;
    for (let i = 1; i < ph.length; i += 1) {
      if (ph[i] !== ph[start]) {
        bands.push({ from: ts[start], to: ts[i], phase: ph[start] });
        start = i;
      }
    }
    bands.push({ from: ts[start], to: ts[ts.length - 1], phase: ph[start] });
  }

  return (
    <div className="flex h-9 shrink-0 items-center gap-3 rule-t bg-panel px-3">
      <Button
        onClick={toggle}
        disabled={!run}
        variant="primary"
        className="w-9"
        title={playing ? "Pause (space)" : "Play (space)"}
      >
        {playing ? "❙❙" : "▶"}
      </Button>

      <div
        ref={track}
        className="relative h-5 min-w-0 flex-1 cursor-ew-resize border border-rule bg-void"
        onPointerDown={(e) => {
          if (!run) return;
          e.preventDefault();
          dragging.current = true;
          setScrubbing(true);
          seek(e.clientX);
        }}
      >
        {bands.map((b, i) => (
          <div
            key={`${b.from}-${i}`}
            className="absolute inset-y-0"
            title={PHASE_LABEL[b.phase]}
            style={{
              left: `${(((b.from - (run?.t0 ?? 0)) / span) * 100).toFixed(4)}%`,
              width: `${(((b.to - b.from) / span) * 100).toFixed(4)}%`,
              background:
                b.phase === 2 ? "rgba(255,255,255,0.07)" : b.phase === 0 ? "rgba(255,255,255,0.14)" : "transparent",
              borderRight: i < bands.length - 1 ? "1px solid #1c1c1c" : undefined,
            }}
          />
        ))}
        {run?.events.map((e, i) => (
          <div
            key={`${e.kind}-${i}`}
            title={`${clock(e.t)}  ${e.label}`}
            className={`absolute top-0 h-full w-px ${
              e.severity === "alert" ? "bg-alert" : e.severity === "warn" ? "bg-bright/60" : "bg-dim"
            }`}
            style={{ left: `${(((e.t - run.t0) / span) * 100).toFixed(4)}%` }}
          />
        ))}
        <div ref={cursor} className="pointer-events-none absolute inset-y-0 w-px bg-bright" style={{ left: 0 }}>
          <div className="absolute -top-px left-[-2px] h-1 w-[5px] bg-bright" />
          <div className="absolute -bottom-px left-[-2px] h-1 w-[5px] bg-bright" />
        </div>
      </div>

      <span ref={readout} className="num w-[64px] shrink-0 text-right text-[12px]">
        {clock(0)}
      </span>
      <span className="num w-[52px] shrink-0 text-right text-[11px] text-dim">
        /{fixed(run?.t1 ?? 0, 1, 6)}
      </span>

      <Segment
        options={SPEEDS.map((s) => ({ value: s, label: `${s}x` }))}
        value={speed}
        onChange={setSpeed}
      />

      <span className="num w-[76px] shrink-0 text-right text-[10px] text-dim">
        {spliceStatus === "solving" ? "re-solving" : run ? `${fixed(run.roundTripMs, 0, 4)} ms` : ""}
      </span>
    </div>
  );
}

/** Drives the playback clock. Mounted once; renders nothing. */
export function PlaybackDriver() {
  const advance = useSim((s) => s.advance);
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      advance(dt);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [advance]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      const s = useSim.getState();
      if (e.code === "Space") {
        e.preventDefault();
        s.toggle();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const step = (e.shiftKey ? 5 : 0.5) * (e.key === "ArrowLeft" ? -1 : 1);
        s.setT(s.t + step);
      } else if (e.key === "Home") {
        s.setT(s.run?.t0 ?? 0);
      } else if (e.key === "End") {
        s.setT(s.run?.t1 ?? 0);
      } else if (e.key >= "1" && e.key <= "5") {
        const cams = ["chase", "rail", "side", "top", "orbit"] as const;
        s.setCamera(cams[Number(e.key) - 1]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return null;
}

/** Sample index at the current cursor, for panels that read raw columns. */
export function useCursorIndex(): number {
  const run = useSim((s) => s.run);
  const t = useSim((s) => s.t);
  return run ? indexAt(run, t) : 0;
}
