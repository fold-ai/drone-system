"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Panel, SubHead } from "@/components/ui/Panel";
import { fixed } from "@/lib/format";
import { useOptimise, type Verification } from "@/lib/optimiseStore";

/**
 * The written interpretation, and the numbers it was given.
 *
 * Two rules shape this panel. The text is labelled as machine-written wherever
 * it appears, in a different colour from every computed figure on the console,
 * because a paragraph that reads like the solver's output will be trusted like
 * it. And it sits beside its own source table, so a claim that does not match
 * the numbers is visible without going to look for them.
 *
 * Figures the model produced that were not in its input are struck through and
 * flagged. That check runs on the server; this only draws the result.
 */
export function Review() {
  const s = useOptimise();
  const canReview = Boolean(s.id) && s.nEvals > 0;

  return (
    <Panel
      title="INTERPRETATION"
      scroll
      right={
        <span className="flex items-center gap-2">
          {s.reviewModel && <span className="num text-[9px] text-dim">{s.reviewModel}</span>}
          <Button
            disabled={!canReview || s.reviewPhase === "running"}
            onClick={() => void s.requestReview(s.reviewPhase === "done")}
            title={
              canReview
                ? "Send the computed results to the language model for comment"
                : "Run a search first"
            }
          >
            {s.reviewPhase === "running"
              ? "Reading"
              : s.reviewPhase === "done"
                ? "Again"
                : "Interpret"}
          </Button>
        </span>
      }
    >
      {s.reviewPhase === "idle" && !s.reviewSource && (
        <p className="p-3 text-[11px] leading-snug text-dim">
          Optional. The solver results above are complete without it. The model is given the
          search result, the sensitivity table and the drag breakdown, and asked what they mean.
          It is not asked what to build and it cannot introduce a number of its own.
        </p>
      )}

      {s.reviewError && (
        <p className="border-b border-alert bg-void px-3 py-2 text-[11px] leading-snug text-alert">
          {s.reviewError}
        </p>
      )}

      {s.review && <Written review={s.review} verification={s.verification} cached={s.reviewCached} usage={s.reviewUsage} />}
      {s.reviewSource && <Source source={s.reviewSource} />}
    </Panel>
  );
}

function Written({
  review, verification, cached, usage,
}: {
  review: NonNullable<ReturnType<typeof useOptimise.getState>["review"]>;
  verification: Verification | null;
  cached: boolean;
  usage: { cost_usd?: number; cap_usd?: number; over_budget?: boolean } | null;
}) {
  const flagged = verification?.unverified ?? [];

  return (
    <div className="border-l-2 border-ai bg-ai-wash">
      <div className="flex flex-wrap items-center gap-2 px-3 pt-2 pb-1">
        <span className="tracked border border-ai px-1.5 py-0.5 text-[9px] text-ai">
          WRITTEN BY A LANGUAGE MODEL
        </span>
        <span className="text-[9px] text-dim">not a computed result</span>
        {cached && <span className="text-[9px] text-dim">cached</span>}
        {usage?.cost_usd !== undefined && (
          <span className="num ml-auto text-[9px] text-dim">
            ${usage.cost_usd.toFixed(4)}
            {usage.cap_usd ? ` of $${usage.cap_usd.toFixed(2)}` : ""}
          </span>
        )}
      </div>

      {verification && (
        <p
          className={`px-3 pb-1 text-[10px] ${flagged.length ? "text-alert" : "text-dim"}`}
        >
          {flagged.length === 0
            ? `All ${verification.numbers_checked} figures matched the source data.`
            : `${flagged.length} of ${verification.numbers_checked} figures are not in the source data and are struck through below.`}
        </p>
      )}

      {review.summary && (
        <p className="px-3 pb-2 text-[11px] leading-relaxed text-ai">
          <Checked text={review.summary} flagged={flagged} />
        </p>
      )}

      {review.binding && review.binding.length > 0 && (
        <Group title="Binding constraints">
          {review.binding.map((b, i) => (
            <li key={i} className="text-[11px] leading-snug text-ai">
              <span className="text-bright">{b.constraint}</span>{" "}
              <Checked text={b.evidence} flagged={flagged} />
            </li>
          ))}
        </Group>
      )}

      {review.worth_effort && review.worth_effort.length > 0 && (
        <Group title="Worth engineering effort">
          {review.worth_effort.map((w, i) => (
            <li key={i} className="text-[11px] leading-snug text-ai">
              <span className="text-bright">{w.parameter}</span>{" "}
              <Checked text={w.why} flagged={flagged} />
            </li>
          ))}
        </Group>
      )}

      {review.investigate_next && review.investigate_next.length > 0 && (
        <Group title="Investigate next">
          {review.investigate_next.map((t, i) => (
            <li key={i} className="text-[11px] leading-snug text-ai">
              <Checked text={t} flagged={flagged} />
            </li>
          ))}
        </Group>
      )}

      {review.caveats && review.caveats.length > 0 && (
        <Group title="What these numbers do not say">
          {review.caveats.map((t, i) => (
            <li key={i} className="text-[11px] leading-snug text-ai">
              <Checked text={t} flagged={flagged} />
            </li>
          ))}
        </Group>
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="px-3 pb-2">
      <h4 className="pb-1 text-[9px] uppercase tracking-[0.1em] text-dim">{title}</h4>
      <ul className="flex list-none flex-col gap-1">{children}</ul>
    </div>
  );
}

/** Strike through any figure the server could not find in the source data. */
function Checked({
  text, flagged,
}: { text: string; flagged: { text: string; nearest_source_value: number | null }[] }) {
  if (!flagged.length) return <>{text}</>;
  const bad = new Set(flagged.map((f) => f.text));
  const parts = text.split(/(-?\d[\d,]*(?:\.\d+)?)/g);
  return (
    <>
      {parts.map((part, i) =>
        bad.has(part) ? (
          <span
            key={i}
            className="text-alert line-through decoration-alert"
            title="This figure is not in the data the model was given."
          >
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

/** The numbers the model was handed, so a wrong claim is visible against them. */
function Source({ source }: { source: Record<string, unknown> }) {
  const sens = source.sensitivity as
    | { rows?: Record<string, number | string>[]; perturbation?: number; note?: string }
    | undefined;
  const drag = source.drag_breakdown as Record<string, number | null> | undefined;
  const opt = source.optimisation as Record<string, unknown> | undefined;
  const bounds = (source.variables_at_bounds as string[] | undefined) ?? [];

  return (
    <div className="rule-t">
      <SubHead
        right={<span className="text-[9px] text-dim">computed</span>}
      >
        Source data
      </SubHead>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 px-3 pb-1">
        <Cell label="Objective" value={String(opt?.objective ?? "-")} />
        <Cell
          label="Evaluations"
          value={`${opt?.evaluations ?? 0} (${opt?.feasible_evaluations ?? 0} feasible)`}
        />
        <Cell label="Solver" value={String(opt?.solver_version ?? "-")} />
        <Cell label="Generation" value={String(opt?.generation ?? "-")} />
      </div>
      <div className="flex flex-wrap items-baseline gap-x-2 px-3 pb-2">
        <span className="text-[10px] text-dim">At bounds</span>
        <span className="num min-w-0 text-[10px] break-words text-bright">
          {bounds.length ? bounds.join(", ") : "none"}
        </span>
      </div>

      {sens?.rows && sens.rows.length > 0 && (
        <>
          <SubHead
            right={
              <span className="num text-[9px] text-dim">
                &plusmn;{fixed((sens.perturbation ?? 0) * 100, 0)}%
              </span>
            }
          >
            Sensitivity, effect on range
          </SubHead>
          <table className="w-full px-3 text-[10px]">
            <tbody>
              {sens.rows.map((r, i) => (
                <tr key={i} className="align-baseline">
                  <td className="py-0.5 pl-3 pr-2 text-dim">{String(r.parameter)}</td>
                  <td className="num py-0.5 pr-2 text-right text-bright">
                    {fixed(Number(r.range_low_pct), 1)}%
                  </td>
                  <td className="num py-0.5 pr-3 text-right text-bright">
                    {fixed(Number(r.range_high_pct), 1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {drag && (
        <>
          <SubHead>Drag breakdown</SubHead>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 px-3 pb-3">
            <Cell label="Peak L/D" value={fixed(Number(drag.ld_max), 2)} />
            <Cell label="at Mach" value={fixed(Number(drag.mach_at_ld_max), 3)} />
            <Cell label="CL there" value={fixed(Number(drag.cl_at_ld_max), 3)} />
            <Cell label="CD there" value={fixed(Number(drag.cd_at_ld_max), 4)} />
          </div>
        </>
      )}
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-2">
      <span className="truncate text-[10px] text-dim">{label}</span>
      <span className="num shrink-0 text-[10px] text-bright">{value}</span>
    </div>
  );
}
