import { NextResponse, type NextRequest } from "next/server";
import { currentOperator } from "@/lib/auth/operator";
import { one, query } from "@/lib/db";
import { callSolver } from "@/lib/solver";
import { saveEvaluations, stableHash } from "@/lib/records/runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The optimisation job.
 *
 * Search is a job with a status table, not a long-lived HTTP call: a few
 * thousand evaluations take far longer than any request may run. Each POST with
 * action "step" advances the search by one bounded batch, writes every
 * evaluation to the run table and returns progress. The console polls it.
 *
 * The batch is run by calling the Python solver server-side with a shared
 * internal token rather than having the browser call it and report back. An
 * audit trail the client could fabricate is not an audit trail.
 */
export async function POST(req: NextRequest) {
  const op = await currentOperator();
  if (!op) return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });

  const body = (await req.json()) as Record<string, unknown>;
  const action = String(body.action ?? "step");

  try {
    if (action === "start") {
      const objective = String(body.objective ?? "range_km");
      const keys = (body.keys as string[]) ?? [];
      const base = body.base ?? {};
      const constraints = body.constraints ?? {};
      const weights = (body.weights as Record<string, number> | undefined) ?? null;
      const population = Number(body.population ?? 24);
      const seed = Number(body.seed ?? Math.floor(Math.random() * 1e6));
      const target = Number(body.n_evals_target ?? 1200);

      const init = await callSolver(req, "/api/optimise", { op: "init", base, keys, population, seed });
      const row = await one<{ id: string }>(
        `INSERT INTO optimisations
           (objective, constraints_json, design_vector_json, algorithm, n_evals_target,
            status, created_by, solver_version, state_json, population, seed,
            base_spec_json, weights_json, started_at)
         VALUES ($1,$2,$3,$4,$5,'running',$6,$7,$8,$9,$10,$11,$12,NOW())
         RETURNING id`,
        [objective, JSON.stringify(constraints), JSON.stringify({ keys }),
         String(init.search_version ?? "de-1.0"), target, op.sub,
         String(init.search_version ?? ""), JSON.stringify(init.state), population, seed,
         JSON.stringify(base), weights ? JSON.stringify(weights) : null],
      );
      return NextResponse.json({
        ok: true, id: row?.id, state: init.state, variables: init.variables,
      });
    }

    if (action === "cancel") {
      await query(
        `UPDATE optimisations SET status = 'cancelled', finished_at = NOW()
          WHERE id = $1 AND status = 'running'`,
        [String(body.id)],
      );
      return NextResponse.json({ ok: true });
    }

    if (action !== "step") {
      return NextResponse.json({ ok: false, error: `unknown action '${action}'` }, { status: 400 });
    }

    const id = String(body.id ?? "");
    const job = await one<{
      id: string; objective: string; constraints_json: unknown; state_json: unknown;
      base_spec_json: unknown; weights_json: unknown; n_evals: number;
      n_evals_target: number | null; status: string; feasible_evals: number;
      design_vector_json: { keys?: string[] };
    }>("SELECT * FROM optimisations WHERE id = $1", [id]);
    if (!job) return NextResponse.json({ ok: false, error: "No such optimisation." }, { status: 404 });
    if (job.status !== "running") {
      return NextResponse.json({ ok: true, done: true, status: job.status, n_evals: job.n_evals });
    }

    const result = await callSolver(req, "/api/optimise", {
      op: "step",
      base: job.base_spec_json ?? {},
      keys: job.design_vector_json?.keys ?? [],
      objective: job.objective,
      weights: job.weights_json ?? undefined,
      constraints: job.constraints_json ?? {},
      state: job.state_json,
      budget: Math.min(300, Number(body.budget ?? 200)),
      deadline_s: Math.min(40, Number(body.deadline_s ?? 30)),
    });

    const evaluations = (result.evaluations ?? []) as {
      values: Record<string, number>; spec_hash: string; feasible: boolean;
      violations: string[]; range_km: number; endurance_s: number; ld_max: number;
      max_level_mach: number; exit_margin: number; min_static_margin: number;
    }[];

    // Every evaluation is recorded, including the rejected ones. A search whose
    // failures are not written down cannot be audited afterwards.
    await saveEvaluations(
      id, op.sub, String((result.search_version as string) ?? "").split("solver-")[1] ?? "unknown",
      evaluations.map((e) => ({
        specHash: e.spec_hash,
        spec: { design_vector: e.values },
        violations: e.violations ?? [],
        summary: {
          range_km: e.range_km, endurance_s: e.endurance_s, ld_max: e.ld_max,
          max_mach: e.max_level_mach, v_rail_exit_ms: e.exit_margin,
          min_static_margin: e.min_static_margin, feasible: e.feasible,
          warning_count: (e.violations ?? []).length,
        },
      })),
    );

    const best = result.best as {
      values: Record<string, number>;
      evaluation: { objective: number; feasible: boolean } | null;
      spec: unknown;
    };
    const nEvals = job.n_evals + evaluations.length;
    const nFeasible = job.feasible_evals + evaluations.filter((e) => e.feasible).length;
    const done = job.n_evals_target !== null && nEvals >= job.n_evals_target;

    await query(
      `UPDATE optimisations
          SET state_json = $2, n_evals = $3, feasible_evals = $4,
              best_objective = $5, heartbeat_at = NOW(),
              status = CASE WHEN $6 THEN 'done' ELSE status END,
              finished_at = CASE WHEN $6 THEN NOW() ELSE finished_at END
        WHERE id = $1`,
      [id, JSON.stringify(result.state), nEvals, nFeasible,
       best?.evaluation?.objective ?? null, done],
    );

    return NextResponse.json({
      ok: true, id, done, n_evals: nEvals, feasible_evals: nFeasible,
      target: job.n_evals_target, best, batch: evaluations.length,
      spec_digest: stableHash(best?.spec ?? {}).slice(0, 12),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (body.id) {
      await query(
        "UPDATE optimisations SET status = 'failed', message = $2, finished_at = NOW() WHERE id = $1",
        [String(body.id), message],
      ).catch(() => undefined);
    }
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const op = await currentOperator();
  if (!op) return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  if (id) {
    const row = await one("SELECT * FROM optimisations WHERE id = $1", [id]);
    return NextResponse.json({ ok: true, optimisation: row });
  }
  const rows = await query(
    `SELECT id, objective, algorithm, status, n_evals, n_evals_target, feasible_evals,
            best_objective, started_at, finished_at
       FROM optimisations ORDER BY started_at DESC NULLS LAST LIMIT 30`,
  );
  return NextResponse.json({ ok: true, optimisations: rows });
}
