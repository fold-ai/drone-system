import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { currentOperator } from "@/lib/auth/operator";
import { one, query } from "@/lib/db";
import { callSolver } from "@/lib/solver";
import { unverified, verifyNumbers } from "@/lib/ai/verify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Interpretation.
 *
 * The model is given the optimisation result, the sensitivity table and the
 * drag breakdown as structured JSON, and asked what the search found, which
 * constraints bind, which parameters are worth engineering effort and what to
 * look at next. It writes to ai_reviews.
 *
 * Three things are enforced rather than requested.
 *
 * The source JSON is assembled here, from Postgres and from the solver, not
 * accepted from the browser. Otherwise the numbers it is "checked against" are
 * whatever the client chose to send.
 *
 * Every numeric literal in the reply is looked for in that source. Anything
 * absent is returned as unverified and the console renders it struck through.
 * The model is told not to invent figures, which is necessary and not
 * sufficient.
 *
 * It is never asked which design to build. The questions are all about what the
 * computed results mean.
 *
 * The key is read from the environment inside this handler and never crosses
 * into the browser bundle. Spend is capped per review and the token cost is
 * recorded next to the text.
 */

const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
/** Overridable so the route can be pointed at a compatible endpoint or a stub. */
const BASE_URL = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
const MAX_OUTPUT_TOKENS = Number(process.env.OPENAI_MAX_OUTPUT_TOKENS ?? 1400);
const MAX_COST_USD = Number(process.env.OPENAI_MAX_COST_USD ?? 0.25);

/** US dollars per million tokens. Override when the model or the price moves. */
const PRICE = {
  prompt: Number(process.env.OPENAI_PROMPT_PRICE ?? 0.15),
  completion: Number(process.env.OPENAI_COMPLETION_PRICE ?? 0.6),
};

const SYSTEM = `You are reviewing results from a flight-performance solver for a
small unmanned aircraft. You are given structured JSON: an optimisation result,
a sensitivity table and a drag breakdown.

Explain what the numbers show. Specifically: what the search converged on, which
constraints are binding, which parameters are worth engineering effort, and what
to investigate next.

Rules.

1. Every number you write must already appear in the JSON you were given. Do not
   compute, convert, estimate or infer any figure that is not there. If a point
   needs a number you do not have, say which number is missing instead.
2. Do not choose a design and do not tell anyone what to build. Describe what
   the search found and what it implies. Suggest what to look at; the solver
   decides what is true.
3. A variable sitting at its bound means the bound is binding, not the physics.
   Say so when it happens.
4. Be concise and specific. No preamble, no restating the question.

Reply as JSON with these keys:
  summary            one paragraph on what the search found
  binding            array of { constraint, evidence }
  worth_effort       array of { parameter, why }, ranked by likely payoff
  investigate_next   array of strings
  caveats            array of strings, what these numbers do not tell you`;

interface DesignVariable {
  key: string;
  label: string;
  unit: string;
  lo: number;
  hi: number;
  path: string;
  note?: string;
}

/** A variable within 1% of an end of its range is being held there by the box. */
function atBound(value: number, lo: number, hi: number): "lo" | "hi" | null {
  const tol = Math.max((hi - lo) * 0.01, 1e-9);
  if (value <= lo + tol) return "lo";
  if (value >= hi - tol) return "hi";
  return null;
}

/** Evenly spaced stations including both ends. */
function sample<T>(rows: T[], n: number): T[] {
  if (rows.length <= n) return rows;
  const step = (rows.length - 1) / (n - 1);
  return Array.from({ length: n }, (_, i) => rows[Math.round(i * step)]);
}

export async function POST(req: NextRequest) {
  const op = await currentOperator();
  if (!op) return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });

  const body = (await req.json()) as { optimisationId?: string; force?: boolean };
  const id = String(body.optimisationId ?? "");
  if (!id) {
    return NextResponse.json(
      { ok: false, error: "A review attaches to an optimisation." },
      { status: 400 },
    );
  }

  const job = await one<{
    id: string; objective: string; algorithm: string; status: string;
    n_evals: number; feasible_evals: number; best_objective: number | null;
    constraints_json: Record<string, number>; base_spec_json: unknown;
    state_json: unknown; design_vector_json: { keys?: string[] };
    weights_json: Record<string, number> | null; solver_version: string;
    started_at: string; finished_at: string | null;
  }>("SELECT * FROM optimisations WHERE id = $1", [id]);
  if (!job) return NextResponse.json({ ok: false, error: "No such optimisation." }, { status: 404 });
  if (!job.n_evals) {
    return NextResponse.json(
      { ok: false, error: "Nothing to review: the search has not evaluated anything." },
      { status: 400 },
    );
  }

  // ---- source JSON, built here from the solver and the database ------------
  let source: Record<string, unknown>;
  try {
    const best = await callSolver(req, "/api/optimise", {
      op: "best",
      base: job.base_spec_json ?? {},
      keys: job.design_vector_json?.keys ?? [],
      objective: job.objective,
      weights: job.weights_json ?? undefined,
      constraints: job.constraints_json ?? {},
      state: job.state_json,
    });

    const values = (best.values ?? {}) as Record<string, number>;
    const variables = (best.variables ?? []) as DesignVariable[];
    const spec = best.spec as Record<string, unknown>;
    const evaluation = (best.evaluation ?? {}) as Record<string, unknown>;

    // Sensitivity is only meaningful for variables that name a real field.
    const paths = variables.map((v) => v.path).filter((p) => !p.startsWith("virtual."));
    const [sens, polar] = await Promise.all([
      callSolver(req, "/api/study", { ...spec, op: "sensitivity", args: { paths } }),
      callSolver(req, "/api/study", { ...spec, op: "polar", args: { n: 41 } }),
    ]);

    const sensitivity = (sens.sensitivity ?? {}) as {
      rows?: Record<string, unknown>[];
      perturbation?: number;
      baseline_range_km?: number;
      note?: string;
    };
    const breakdown = (polar.polar ?? {}) as {
      ld_max?: number; mach_at_ld_max?: number; cl_at_ld_max?: number;
      cd_at_ld_max?: number; cruise_ld?: number; note?: string;
      breakdown?: Record<string, number>[];
    };

    const design = variables.map((v) => {
      const value = values[v.key];
      const bound = atBound(value, v.lo, v.hi);
      return {
        key: v.key, label: v.label, unit: v.unit, value,
        bounds: [v.lo, v.hi], at_bound: bound,
        note: bound
          ? `at its ${bound === "lo" ? "lower" : "upper"} bound, so the bound is binding`
          : v.note ?? "",
      };
    });

    source = {
      optimisation: {
        objective: job.objective,
        algorithm: job.algorithm,
        status: job.status,
        evaluations: job.n_evals,
        feasible_evaluations: job.feasible_evals,
        generation: best.generation ?? null,
        solver_version: job.solver_version,
        constraints: job.constraints_json ?? {},
        weights: job.weights_json,
      },
      best_design: design,
      best_result: evaluation,
      variables_at_bounds: design.filter((d) => d.at_bound).map((d) => d.key),
      sensitivity: {
        perturbation: sensitivity.perturbation,
        baseline_range_km: sensitivity.baseline_range_km,
        note: sensitivity.note,
        rows: (sensitivity.rows ?? []).map((r) => ({
          parameter: r.label, unit: r.unit, baseline: r.baseline,
          range_low_pct: r.range_low_pct, range_high_pct: r.range_high_pct,
          endurance_low_pct: r.endurance_low_pct, endurance_high_pct: r.endurance_high_pct,
          ld_low_pct: r.ld_low_pct, ld_high_pct: r.ld_high_pct, span_pct: r.span_pct,
        })),
      },
      drag_breakdown: {
        note: breakdown.note ?? null,
        ld_max: breakdown.ld_max ?? null,
        mach_at_ld_max: breakdown.mach_at_ld_max ?? null,
        cl_at_ld_max: breakdown.cl_at_ld_max ?? null,
        cd_at_ld_max: breakdown.cd_at_ld_max ?? null,
        cruise_ld: breakdown.cruise_ld ?? null,
        // Sampled rather than sent whole: 41 stations of twelve fields is a
        // large prompt and the shape of the curve is legible from eight.
        stations: sample(breakdown.breakdown ?? [], 8).map((d) => ({
          mach: d.mach, cl: d.cl, cd_total: d.cd_total, ld: d.ld,
          counts_cd0: d.counts_cd0, counts_cdi: d.counts_cdi, counts_wave: d.counts_wave,
          frac_cd0: d.frac_cd0, frac_cdi: d.frac_cdi, frac_wave: d.frac_wave,
        })),
      },
    };
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: `Could not assemble the source data: ${
          err instanceof Error ? err.message : String(err)
        }`,
      },
      { status: 502 },
    );
  }

  const promptHash = createHash("sha256")
    .update(`${MODEL}\n${SYSTEM}\n${JSON.stringify(source)}`)
    .digest("hex");

  // The same question is not paid for twice.
  if (!body.force) {
    const cached = await one<{
      id: string; response_json: Record<string, unknown>; token_cost: string; model: string;
      created_at: string;
    }>(
      `SELECT id, response_json, token_cost, model, created_at FROM ai_reviews
        WHERE prompt_hash = $1 ORDER BY created_at DESC LIMIT 1`,
      [promptHash],
    );
    if (cached) {
      const { _verification, ...review } = cached.response_json;
      return NextResponse.json({
        ok: true, cached: true, id: cached.id, model: cached.model,
        review, source, verification: _verification ?? null,
        usage: { cost_usd: Number(cached.token_cost), cap_usd: MAX_COST_USD },
      });
    }
  }

  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return NextResponse.json(
      {
        ok: false, source,
        error:
          "OPENAI_API_KEY is not set. The review is commentary; the computed results above stand without it.",
      },
      { status: 503 },
    );
  }

  let payload: Record<string, unknown>;
  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: JSON.stringify(source) },
        ],
      }),
      signal: AbortSignal.timeout(45_000),
    });
    payload = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      const detail = (payload.error as { message?: string } | undefined)?.message;
      return NextResponse.json(
        { ok: false, source, error: detail ?? `OpenAI returned ${res.status}` },
        { status: 502 },
      );
    }
  } catch (err) {
    return NextResponse.json(
      {
        ok: false, source,
        error: err instanceof Error ? err.message : "Could not reach OpenAI.",
      },
      { status: 502 },
    );
  }

  const raw =
    (payload.choices as { message?: { content?: string } }[] | undefined)?.[0]?.message?.content ??
    "{}";
  let review: Record<string, unknown>;
  try {
    review = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    review = { summary: raw };
  }

  const usage = (payload.usage ?? {}) as { prompt_tokens?: number; completion_tokens?: number };
  const promptTokens = usage.prompt_tokens ?? 0;
  const completionTokens = usage.completion_tokens ?? 0;
  const cost = (promptTokens * PRICE.prompt + completionTokens * PRICE.completion) / 1_000_000;

  // Every figure it cites has to be present in the JSON it was given.
  const checks = verifyNumbers(JSON.stringify(review), source);
  const bad = unverified(checks);
  const verification = {
    numbers_checked: checks.length,
    unverified: bad.map((c) => ({ text: c.text, nearest_source_value: c.nearest ?? null })),
  };

  const row = await one<{ id: string }>(
    `INSERT INTO ai_reviews (optimisation_id, model, prompt_hash, source_json, response_json,
                             created_by, prompt_tokens, completion_tokens, token_cost)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [
      id, MODEL, promptHash, JSON.stringify(source),
      JSON.stringify({ ...review, _verification: verification }),
      op.sub, promptTokens, completionTokens, cost,
    ],
  );

  const overBudget = cost > MAX_COST_USD;
  if (overBudget) {
    await query(
      `UPDATE ai_reviews SET response_json = response_json || '{"_over_budget":true}'::jsonb
        WHERE id = $1`,
      [row?.id],
    );
  }

  return NextResponse.json({
    ok: true, id: row?.id, model: MODEL, review, source, verification,
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      cost_usd: Number(cost.toFixed(6)),
      cap_usd: MAX_COST_USD,
      over_budget: overBudget,
    },
  });
}

export async function GET(req: NextRequest) {
  const op = await currentOperator();
  if (!op) return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
  const id = req.nextUrl.searchParams.get("optimisationId");
  if (!id) return NextResponse.json({ ok: false, error: "optimisationId is required." }, { status: 400 });
  const rows = await query(
    `SELECT id, model, source_json, response_json, prompt_tokens, completion_tokens,
            token_cost, created_at
       FROM ai_reviews WHERE optimisation_id = $1 ORDER BY created_at DESC LIMIT 10`,
    [id],
  );
  return NextResponse.json({ ok: true, reviews: rows });
}
