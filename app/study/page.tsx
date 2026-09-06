"use client";

import { useEffect } from "react";
import { DragBreakdown } from "@/components/study/DragBreakdown";
import { PolarChart } from "@/components/study/PolarChart";
import { Sensitivity } from "@/components/study/Sensitivity";
import { Improvements } from "@/components/study/Improvements";
import { SweepExplorer } from "@/components/study/SweepExplorer";
import { StudyControls } from "@/components/study/StudyControls";
import { Brand } from "@/components/ui/Brand";
import { useResizable, VDivider } from "@/components/ui/Split";
import * as bc from "@/lib/broadcast";
import { fixed } from "@/lib/format";
import { useStudy } from "@/lib/studyStore";

/**
 * Airframe study.
 *
 * Not a mirror of the console. It runs its own solves against the same API and
 * answers a different question: what does the shape do to the aerodynamics, and
 * what would make it better. It listens to the console's broadcast only to mark
 * the current operating point on the polar.
 */
export default function Study() {
  const spec = useStudy((s) => s.spec);
  const run = useStudy((s) => s.run);
  const setOperating = useStudy((s) => s.setOperating);
  const polarJob = useStudy((s) => s.jobs.polar);
  const left = useResizable(320, 240, 520, "study-left");
  const right = useResizable(360, 260, 620, "study-right");

  useEffect(() => {
    void run("polar");
  }, [run, spec]);

  useEffect(() => {
    const ch = bc.open();
    if (!ch) return undefined;
    ch.onmessage = (ev: MessageEvent<bc.Message>) => {
      const msg = ev.data;
      if (msg.kind !== "run" || !msg.payload) return;
      const s = msg.payload;
      const cols = s.columns;
      const iM = cols.indexOf("mach");
      const iCl = cols.indexOf("cl");
      const iCd = cols.indexOf("cd");
      const iLd = cols.indexOf("ld");
      if (iM < 0) return;
      const view = new Float32Array(s.buffer);
      const mid = Math.floor(s.n * 0.5);
      setOperating({
        mach: view[iM * s.n + mid],
        cl: iCl >= 0 ? view[iCl * s.n + mid] : 0,
        cd: iCd >= 0 ? view[iCd * s.n + mid] : 0,
        ld: iLd >= 0 ? view[iLd * s.n + mid] : 0,
        label: s.label,
      });
    };
    ch.postMessage({ kind: "hello" } satisfies bc.Message);
    return () => ch.close();
  }, [setOperating]);

  return (
    <main className="flex h-dvh w-dvw flex-col overflow-hidden bg-void">
      <header className="flex h-11 shrink-0 items-center gap-4 rule-b bg-panel px-3">
        <Brand product="AIRFRAME STUDY" nav="study" />
        <span className="num text-[11px] text-dim">
          AR {fixed((spec.airframe.span_m * spec.airframe.span_m) / spec.airframe.wing_area_m2, 2)}{" "}
          &middot; S {fixed(spec.airframe.wing_area_m2, 3)} m2 &middot; CD0{" "}
          {fixed(spec.airframe.cd0_sub * 1e4, 0)} ct
        </span>
        <span className="num ml-auto text-[10px] text-dim">
          {polarJob.phase === "running" ? "solving" : `${fixed(polarJob.ms, 0)} ms`}
        </span>
      </header>

      <div className="flex min-h-0 flex-1">
        <div style={{ width: left.size }} className="flex min-h-0 shrink-0 flex-col rule-r">
          <StudyControls />
        </div>
        <VDivider onDrag={left.drag} onReset={left.reset} />

        <div className="min-w-0 flex-1 overflow-y-auto">
          <DragBreakdown />
          <div className="rule-t">
            <PolarChart />
          </div>
          <div className="rule-t">
            <Sensitivity />
          </div>
          <div className="rule-t">
            <SweepExplorer />
          </div>
        </div>

        <VDivider onDrag={(dx) => right.drag(-dx)} onReset={right.reset} />
        <div style={{ width: right.size }} className="flex min-h-0 shrink-0 flex-col rule-l">
          <Improvements />
        </div>
      </div>
    </main>
  );
}
