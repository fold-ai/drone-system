import { NextResponse, type NextRequest } from "next/server";
import { currentOperator } from "@/lib/auth/operator";
import { query } from "@/lib/db";
import { hashSpec, listRuns, loadRun, saveRun } from "@/lib/records/runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Saving and loading test records.
 *
 * The trajectory arrives exactly as the solver encoded it - deflated, byte-plane
 * shuffled, base64 - and is stored as those bytes. Re-encoding it here would be
 * a second implementation of the wire format, and it would drift.
 */
export async function POST(req: NextRequest) {
  const op = await currentOperator();
  if (!op) return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });

  const body = (await req.json()) as {
    name?: string;
    notes?: string;
    spec?: unknown;
    summary?: Record<string, number | boolean | null>;
    warnings?: { severity: string; code?: string | null; message: string; t_s?: number | null }[];
    events?: { t_s: number; kind: string; label: string; detail?: string }[];
    solverVersion?: string;
    wallMs?: number;
    trajectory?: { format: string; columns: string[]; n: number; data: string };
    sampleHz?: number;
    pinned?: boolean;
  };

  if (!body.spec) {
    return NextResponse.json({ ok: false, error: "A run needs its specification." }, { status: 400 });
  }
  const name = (body.name ?? "").trim();
  if (!name) {
    return NextResponse.json(
      { ok: false, error: "Give the run a name. An unnamed record is not a record." },
      { status: 400 },
    );
  }

  const t = body.trajectory;
  let trajectory = null;
  if (t?.data && typeof t.data === "string") {
    const payload = Buffer.from(t.data, "base64");
    // 60 MB of base64 is a mistake, not a trajectory.
    if (payload.length > 48 * 1024 * 1024) {
      return NextResponse.json(
        { ok: false, error: "That trajectory is larger than the 48 MB ceiling." },
        { status: 413 },
      );
    }
    trajectory = {
      sampleHz: body.sampleHz ?? 0,
      columnNames: t.columns ?? [],
      payload,
      encoding: t.format,
      nSamples: t.n ?? 0,
      pinned: Boolean(body.pinned),
    };
  }

  try {
    const id = await saveRun({
      specHash: hashSpec(body.spec),
      spec: body.spec,
      kind: "single",
      name,
      notes: (body.notes ?? "").trim() || null,
      createdBy: op.sub,
      solverVersion: body.solverVersion ?? "unknown",
      wallMs: body.wallMs ?? null,
      summary: {
        range_km: num(body.summary?.range_km),
        endurance_s: num(body.summary?.endurance_s),
        ld_max: num(body.summary?.ld_max),
        max_mach: num(body.summary?.max_mach),
        fuel_burn_kg: num(body.summary?.fuel_burn_kg),
        v_rail_exit_ms: num(body.summary?.v_rail_exit_ms),
        max_load_factor: num(body.summary?.max_load_factor),
        max_altitude_m: num(body.summary?.max_altitude_m),
        max_q_pa: num(body.summary?.max_q_pa),
        min_static_margin: num(body.summary?.min_static_margin),
        feasible: body.summary?.feasible !== false,
        warning_count: (body.warnings ?? []).length,
      },
      // The severity column is constrained; anything unrecognised is recorded
      // as advisory rather than rejecting the whole run.
      warnings: (body.warnings ?? []).map((w) => ({
        severity: ["blocking", "advisory", "info"].includes(w.severity) ? w.severity : "advisory",
        code: w.code ?? null,
        message: w.message,
        t_s: w.t_s ?? null,
      })),
      events: body.events ?? [],
      trajectory,
    });
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export async function GET(req: NextRequest) {
  const op = await currentOperator();
  if (!op) return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });

  const p = req.nextUrl.searchParams;
  const id = p.get("id");
  if (id) {
    const loaded = await loadRun(id);
    if (!loaded) return NextResponse.json({ ok: false, error: "No such run." }, { status: 404 });
    const t = loaded.trajectory;
    return NextResponse.json({
      ok: true,
      run: loaded.run,
      warnings: loaded.warnings,
      events: loaded.events,
      // Handed back in the shape the client decoder already understands.
      trajectory: t
        ? {
            format: t.encoding,
            columns: t.column_names,
            n: t.n_samples,
            stride: t.column_names.length,
            data: Buffer.from(t.payload).toString("base64"),
          }
        : null,
    });
  }

  const feasibleParam = p.get("feasible");
  const rows = await listRuns({
    kind: p.get("kind"),
    feasible: feasibleParam === null ? null : feasibleParam === "true",
    since: p.get("since"),
    sort: p.get("sort") ?? "created_at",
    direction: p.get("direction") === "asc" ? "asc" : "desc",
    limit: Number(p.get("limit") ?? 200),
  });
  return NextResponse.json({ ok: true, runs: rows });
}

export async function DELETE(req: NextRequest) {
  const op = await currentOperator();
  if (!op) return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "id is required." }, { status: 400 });
  // Pinned runs are the ones someone decided to keep. Deleting one has to be a
  // deliberate act, not a side effect of tidying the library.
  const rows = await query<{ pinned: boolean }>(
    "SELECT pinned FROM trajectories WHERE run_id = $1",
    [id],
  );
  if (rows[0]?.pinned && req.nextUrl.searchParams.get("force") !== "true") {
    return NextResponse.json(
      { ok: false, error: "That run is pinned. Unpin it first." },
      { status: 409 },
    );
  }
  await query("DELETE FROM runs WHERE id = $1", [id]);
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const op = await currentOperator();
  if (!op) return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
  const body = (await req.json()) as { id?: string; name?: string; notes?: string; pinned?: boolean };
  if (!body.id) return NextResponse.json({ ok: false, error: "id is required." }, { status: 400 });
  if (body.name !== undefined || body.notes !== undefined) {
    await query(
      `UPDATE runs SET name = COALESCE($2, name), notes = COALESCE($3, notes) WHERE id = $1`,
      [body.id, body.name ?? null, body.notes ?? null],
    );
  }
  if (body.pinned !== undefined) {
    await query("UPDATE trajectories SET pinned = $2 WHERE run_id = $1", [body.id, body.pinned]);
  }
  return NextResponse.json({ ok: true });
}
