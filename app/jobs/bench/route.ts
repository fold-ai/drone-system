import { NextResponse, type NextRequest } from "next/server";
import { currentOperator } from "@/lib/auth/operator";
import { one, query, transaction } from "@/lib/db";
import { callSolver } from "@/lib/solver";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Bench and flight data against the model.
 *
 * The CSV is stored as the bytes that were uploaded, alongside the column map
 * that was used to read it. Storing a parsed table instead would lose the file
 * someone can hand back to whoever produced it, and a mapping is a judgement
 * that deserves to be recorded next to its result.
 *
 * The residuals are computed by the solver, not here. There is one drag polar
 * and one engine deck in this project and they live in api/_core.
 */

const MAX_CSV_BYTES = 8 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const op = await currentOperator();
  if (!op) return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });

  const body = (await req.json()) as {
    action?: string;
    csv?: string;
    quantity?: string;
    mapping?: Record<string, string>;
    scales?: Record<string, number>;
    spec?: unknown;
    source?: string;
    kind?: string;
    notes?: string;
    recordedAt?: string | null;
    runId?: string | null;
    benchRunId?: string | null;
  };
  const action = String(body.action ?? "compare");

  try {
    if (action === "quantities") {
      const res = await callSolver(req, "/api/bench", { op: "quantities" });
      return NextResponse.json({ ok: true, quantities: res.quantities });
    }

    if (action === "sniff") {
      if (!body.csv) {
        return NextResponse.json({ ok: false, error: "No file contents." }, { status: 400 });
      }
      const res = await callSolver(req, "/api/bench", { op: "sniff", csv: body.csv });
      return NextResponse.json({
        ok: true, columns: res.columns, quantities: res.quantities, preview: res.preview,
      });
    }

    if (action === "compare" || action === "save") {
      const csv = body.csv ?? "";
      if (!csv) {
        return NextResponse.json({ ok: false, error: "No file contents." }, { status: 400 });
      }
      if (Buffer.byteLength(csv, "utf8") > MAX_CSV_BYTES) {
        return NextResponse.json(
          { ok: false, error: "That file is larger than the 8 MB ceiling." },
          { status: 413 },
        );
      }
      const res = await callSolver(req, "/api/bench", {
        ...(body.spec as Record<string, unknown>),
        op: "compare",
        csv,
        quantity: body.quantity,
        mapping: body.mapping ?? {},
        scales: body.scales ?? {},
      });
      const comparison = res.comparison as {
        quantity: string; unit: string; kind: string; n: number;
        rows: { row: number; condition: Record<string, number>; measured: number;
                model: number; residual: number }[];
      };

      if (action !== "save") {
        return NextResponse.json({ ok: true, comparison, saved: false });
      }

      const source = (body.source ?? "").trim();
      if (!source) {
        return NextResponse.json(
          { ok: false, error: "Say where this data came from. An unattributed measurement is not evidence." },
          { status: 400 },
        );
      }

      const benchRunId = await transaction(async (c) => {
        const id = (
          await c.query<{ id: string }>(
            `INSERT INTO bench_runs (source, kind, recorded_at, uploaded_by, notes, csv,
                                     column_map, row_count)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
            [
              source,
              body.kind ?? comparison.kind ?? "engine",
              body.recordedAt || null,
              op.sub,
              (body.notes ?? "").trim() || null,
              Buffer.from(csv, "utf8"),
              JSON.stringify({
                quantity: body.quantity,
                mapping: body.mapping ?? {},
                scales: body.scales ?? {},
              }),
              comparison.n,
            ],
          )
        ).rows[0].id;

        for (const r of comparison.rows) {
          await c.query(
            `INSERT INTO validation_points (bench_run_id, run_id, quantity, condition_json,
                                            measured, model, residual, unit)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [id, body.runId ?? null, comparison.quantity, JSON.stringify(r.condition),
             r.measured, r.model, r.residual, comparison.unit],
          );
        }
        return id;
      });

      return NextResponse.json({ ok: true, comparison, saved: true, benchRunId });
    }

    return NextResponse.json({ ok: false, error: `unknown action '${action}'` }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  const op = await currentOperator();
  if (!op) return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (id) {
    const run = await one(
      `SELECT id, source, kind, recorded_at, uploaded_at, notes, column_map, row_count,
              length(csv) AS csv_bytes
         FROM bench_runs WHERE id = $1`,
      [id],
    );
    if (!run) return NextResponse.json({ ok: false, error: "No such import." }, { status: 404 });
    const points = await query(
      `SELECT quantity, condition_json, measured, model, residual, unit
         FROM validation_points WHERE bench_run_id = $1 ORDER BY id`,
      [id],
    );
    return NextResponse.json({ ok: true, benchRun: run, points });
  }

  // The library of imports, each with the residual statistics computed in the
  // database rather than by reading every point back out.
  const rows = await query(
    `SELECT b.id, b.source, b.kind, b.recorded_at, b.uploaded_at, b.notes, b.row_count,
            b.column_map,
            count(v.id)                                   AS n_points,
            avg(v.residual)                               AS bias,
            sqrt(avg(v.residual * v.residual))            AS rms,
            max(abs(v.residual))                          AS max_abs,
            min(v.quantity)                               AS quantity,
            min(v.unit)                                   AS unit
       FROM bench_runs b
       LEFT JOIN validation_points v ON v.bench_run_id = b.id
      GROUP BY b.id
      ORDER BY b.uploaded_at DESC
      LIMIT 100`,
  );
  return NextResponse.json({ ok: true, imports: rows });
}

export async function DELETE(req: NextRequest) {
  const op = await currentOperator();
  if (!op) return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "id is required." }, { status: 400 });
  await query("DELETE FROM bench_runs WHERE id = $1", [id]);
  return NextResponse.json({ ok: true });
}
