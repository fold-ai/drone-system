"use client";

import { BestDesign } from "@/components/optimise/BestDesign";
import { Progress } from "@/components/optimise/Progress";
import { Review } from "@/components/optimise/Review";
import { SearchControls } from "@/components/optimise/SearchControls";
import { Brand } from "@/components/ui/Brand";
import { ScaleBadge } from "@/components/ui/ScaleBadge";
import { useResizable, VDivider } from "@/components/ui/Split";
import { useOptimise } from "@/lib/optimiseStore";

/**
 * Design search.
 *
 * The page holds no physics. It declares a design vector, an objective and a
 * set of constraints, then asks the server to run the search; every evaluation
 * is a real solver call recorded in the run table, so the search can be audited
 * afterwards rather than taken on trust.
 *
 * The optimiser proposes and the operator disposes. Nothing here writes a
 * design back into the console: a search result is a direction to look, and the
 * decision belongs to a person.
 */
export default function Optimise() {
  const left = useResizable(300, 250, 460, "opt-left");
  const right = useResizable(400, 300, 640, "opt-right");
  const base = useOptimise((s) => s.base);
  const best = useOptimise((s) => s.best);
  const phase = useOptimise((s) => s.phase);
  const nEvals = useOptimise((s) => s.nEvals);

  // Once the search has found something, the badge describes that aircraft
  // rather than the starting point, because every figure on the page does.
  const shownLength = best?.values?.length_m ?? base.airframe.length_m;

  return (
    <main className="flex h-dvh w-dvw flex-col overflow-hidden bg-void">
      <header className="flex h-11 shrink-0 items-center gap-4 rule-b bg-panel px-3">
        <Brand product="DESIGN SEARCH" nav="optimise" />
        <ScaleBadge lengthM={shownLength} />
        <span className="num ml-auto text-[10px] text-dim">
          {phase === "running" ? `searching, ${nEvals} evaluations` : `${nEvals} evaluations`}
        </span>
      </header>

      <div className="flex min-h-0 flex-1">
        <div style={{ width: left.size }} className="flex min-h-0 shrink-0 flex-col rule-r">
          <SearchControls />
        </div>
        <VDivider onDrag={left.drag} onReset={left.reset} />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <Progress />
          <div className="min-h-0 flex-1 rule-t">
            <BestDesign />
          </div>
        </div>

        <VDivider onDrag={(dx) => right.drag(-dx)} onReset={right.reset} />
        <div style={{ width: right.size }} className="flex min-h-0 shrink-0 flex-col rule-l">
          <Review />
        </div>
      </div>
    </main>
  );
}
