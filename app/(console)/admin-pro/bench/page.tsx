"use client";

import { ImportLibrary } from "@/components/bench/ImportLibrary";
import { ImportPanel } from "@/components/bench/ImportPanel";
import { Residuals } from "@/components/bench/Residuals";
import { Brand } from "@/components/ui/Brand";
import { useResizable, VDivider } from "@/components/ui/Split";
import { useBench } from "@/lib/benchStore";

/**
 * Bench data.
 *
 * A page rather than a button behind a menu. Comparing the model with a
 * measurement is the only thing on this project that can tell you the model is
 * wrong, so it gets the same standing as the console and the study.
 */
export default function Bench() {
  const left = useResizable(340, 280, 520, "bench-left");
  const right = useResizable(320, 240, 520, "bench-right");
  const comparison = useBench((s) => s.comparison);

  return (
    <main className="flex h-dvh w-dvw flex-col overflow-hidden bg-void">
      <header className="flex h-11 shrink-0 items-center gap-4 rule-b bg-panel px-3">
        <Brand product="BENCH DATA" nav="bench" />
        <span className="text-[10px] leading-snug text-dim">
          Measurements against the model, at the conditions they were measured at
        </span>
        {comparison && (
          <span className="num ml-auto text-[10px] text-dim">
            {comparison.n} points &middot; rms {comparison.rms_pct.toFixed(2)}%
          </span>
        )}
      </header>

      <div className="flex min-h-0 flex-1">
        <div style={{ width: left.size }} className="flex min-h-0 shrink-0 flex-col rule-r">
          <ImportPanel />
        </div>
        <VDivider onDrag={left.drag} onReset={left.reset} />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <Residuals />
        </div>

        <VDivider onDrag={(dx) => right.drag(-dx)} onReset={right.reset} />
        <div style={{ width: right.size }} className="flex min-h-0 shrink-0 flex-col rule-l">
          <ImportLibrary />
        </div>
      </div>
    </main>
  );
}
