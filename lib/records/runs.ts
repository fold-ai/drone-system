/**
 * Writing and reading test records.
 *
 * Plain SQL. The queries are analytical and the one that matters - pulling a
 * trajectory payload back - is a single row fetch of a bytea, which no ORM
 * would improve.
 */
import { createHash } from "node:crypto";
import { one, query, transaction } from "@/lib/db";

export function hashSpec(spec: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(spec, Object.keys(spec as object).sort()))
    .digest("hex")
    .slice(0, 32);
}

export function stableHash(value: unknown): string {
  const seen = new WeakSet();
  const sort = (v: unknown): unknown => {
    if (v === null || typeof v !== "object") return v;
    if (seen.has(v as object)) return null;
    seen.add(v as object);
    if (Array.isArray(v)) return v.map(sort);
    return Object.fromEntries(
      Object.keys(v as Record<string, unknown>)
        .sort()
        .map((k) => [k, sort((v as Record<string, unknown>)[k])]),
    );
  };
  return createHash("sha256").update(JSON.stringify(sort(value))).digest("hex");
}

export function gitSha(): string | null {
  return (
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.GIT_SHA ??
    process.env.NEXT_PUBLIC_GIT_SHA ??
    null
  );
}

export interface SummaryInput {
  range_km?: number | null;
  endurance_s?: number | null;
  ld_max?: number | null;
  max_mach?: number | null;
  fuel_burn_kg?: number | null;
  v_rail_exit_ms?: number | null;
  max_load_factor?: number | null;
  max_altitude_m?: number | null;
  max_q_pa?: number | null;
  min_static_margin?: number | null;
  feasible?: boolean;
  warning_count?: number;
}

export interface SaveRunInput {
  airframeId?: string | null;
  specHash: string;
  spec: unknown;
  kind: "single" | "sweep" | "optimisation" | "monte_carlo";
  name?: string | null;
  notes?: string | null;
  createdBy?: string | null;
  solverVersion: string;
  wallMs?: number | null;
  optimisationId?: string | null;
  summary: SummaryInput;
  warnings?: { severity: string; code?: string | null; message: string; t_s?: number | null }[];
  events?: { t_s: number; kind: string; label: string; detail?: string | null }[];
  trajectory?: {
    sampleHz: number;
    columnNames: string[];
    payload: Buffer;
    encoding: string;
    nSamples: number;
    pinned?: boolean;
  } | null;
}

/** One run and everything hanging off it, in one transaction. */
export async function saveRun(input: SaveRunInput): Promise<string> {
  return transaction(async (c) => {
    const run = (
      await c.query<{ id: string }>(
        `INSERT INTO runs (airframe_id, spec_hash, spec_json, kind, name, notes,
                           created_by, solver_version, git_sha, wall_ms, optimisation_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [
          input.airframeId ?? null, input.specHash, JSON.stringify(input.spec), input.kind,
          input.name ?? null, input.notes ?? null, input.createdBy ?? null,
          input.solverVersion, gitSha(), input.wallMs ?? null, input.optimisationId ?? null,
        ],
      )
    ).rows[0].id;

    const s = input.summary;
    await c.query(
      `INSERT INTO run_summary (run_id, range_km, endurance_s, ld_max, max_mach, fuel_burn_kg,
                                v_rail_exit_ms, max_load_factor, max_altitude_m, max_q_pa,
                                min_static_margin, feasible, warning_count)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [run, s.range_km ?? null, s.endurance_s ?? null, s.ld_max ?? null, s.max_mach ?? null,
       s.fuel_burn_kg ?? null, s.v_rail_exit_ms ?? null, s.max_load_factor ?? null,
       s.max_altitude_m ?? null, s.max_q_pa ?? null, s.min_static_margin ?? null,
       s.feasible ?? true, s.warning_count ?? 0],
    );

    for (const [i, w] of (input.warnings ?? []).entries()) {
      await c.query(
        `INSERT INTO run_warnings (run_id, seq, severity, code, message, t_s)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [run, i, w.severity, w.code ?? null, w.message, w.t_s ?? null],
      );
    }
    for (const [i, e] of (input.events ?? []).entries()) {
      await c.query(
        `INSERT INTO run_events (run_id, seq, t_s, kind, label, detail)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [run, i, e.t_s, e.kind, e.label, e.detail ?? null],
      );
    }
    if (input.trajectory) {
      const t = input.trajectory;
      await c.query(
        `INSERT INTO trajectories (run_id, sample_hz, column_names, payload, encoding,
                                   n_samples, bytes, pinned)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [run, t.sampleHz, t.columnNames, t.payload, t.encoding, t.nSamples,
         t.payload.length, t.pinned ?? false],
      );
    }
    return run;
  });
}

/** Many evaluations from one optimiser batch, without a transaction each. */
export async function saveEvaluations(
  optimisationId: string,
  createdBy: string | null,
  solverVersion: string,
  rows: {
    specHash: string;
    spec: unknown;
    summary: SummaryInput;
    violations: string[];
  }[],
): Promise<number> {
  if (rows.length === 0) return 0;
  return transaction(async (c) => {
    let n = 0;
    for (const r of rows) {
      const run = (
        await c.query<{ id: string }>(
          `INSERT INTO runs (spec_hash, spec_json, kind, created_by, solver_version,
                             git_sha, optimisation_id)
           VALUES ($1,$2,'optimisation',$3,$4,$5,$6) RETURNING id`,
          [r.specHash, JSON.stringify(r.spec), createdBy, solverVersion, gitSha(),
           optimisationId],
        )
      ).rows[0].id;
      const s = r.summary;
      await c.query(
        `INSERT INTO run_summary (run_id, range_km, endurance_s, ld_max, max_mach,
                                  v_rail_exit_ms, min_static_margin, feasible, warning_count)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [run, s.range_km ?? null, s.endurance_s ?? null, s.ld_max ?? null, s.max_mach ?? null,
         s.v_rail_exit_ms ?? null, s.min_static_margin ?? null, s.feasible ?? true,
         r.violations.length],
      );
      for (const [i, v] of r.violations.entries()) {
        await c.query(
          `INSERT INTO run_warnings (run_id, seq, severity, code, message)
           VALUES ($1,$2,'blocking',$3,$4)`,
          [run, i, "constraint", `Constraint violated: ${v}`],
        );
      }
      n += 1;
    }
    return n;
  });
}

export interface RunRow {
  id: string;
  name: string | null;
  kind: string;
  created_at: string;
  solver_version: string;
  git_sha: string | null;
  airframe_id: string | null;
  airframe_name: string | null;
  range_km: number | null;
  endurance_s: number | null;
  ld_max: number | null;
  max_mach: number | null;
  v_rail_exit_ms: number | null;
  max_load_factor: number | null;
  min_static_margin: number | null;
  feasible: boolean;
  warning_count: number;
  has_trajectory: boolean;
}

const SORTABLE = new Set([
  "created_at", "range_km", "endurance_s", "ld_max", "max_mach",
  "fuel_burn_kg", "v_rail_exit_ms", "max_load_factor", "warning_count",
]);

export async function listRuns(opts: {
  airframeId?: string | null;
  kind?: string | null;
  feasible?: boolean | null;
  since?: string | null;
  sort?: string;
  direction?: "asc" | "desc";
  limit?: number;
} = {}): Promise<RunRow[]> {
  // Whitelisted, because a sort column cannot be a bound parameter.
  const sort = SORTABLE.has(opts.sort ?? "") ? (opts.sort as string) : "created_at";
  const dir = opts.direction === "asc" ? "ASC" : "DESC";
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.airframeId) {
    params.push(opts.airframeId);
    where.push(`r.airframe_id = $${params.length}`);
  }
  if (opts.kind) {
    params.push(opts.kind);
    where.push(`r.kind = $${params.length}`);
  }
  if (opts.feasible !== null && opts.feasible !== undefined) {
    params.push(opts.feasible);
    where.push(`s.feasible = $${params.length}`);
  }
  if (opts.since) {
    params.push(opts.since);
    where.push(`r.created_at >= $${params.length}`);
  }
  params.push(Math.min(500, Math.max(1, opts.limit ?? 100)));

  const table = sort === "created_at" ? "r" : "s";
  return query<RunRow>(
    `SELECT r.id, r.name, r.kind, r.created_at, r.solver_version, r.git_sha,
            r.airframe_id, a.name AS airframe_name,
            s.range_km, s.endurance_s, s.ld_max, s.max_mach, s.v_rail_exit_ms,
            s.max_load_factor, s.min_static_margin, s.feasible, s.warning_count,
            (t.run_id IS NOT NULL) AS has_trajectory
       FROM runs r
       JOIN run_summary s ON s.run_id = r.id
       LEFT JOIN airframes a ON a.id = r.airframe_id
       LEFT JOIN trajectories t ON t.run_id = r.id
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY ${table}.${sort} ${dir} NULLS LAST
      LIMIT $${params.length}`,
    params,
  );
}

export async function loadRun(id: string) {
  const run = await one(
    `SELECT r.*, s.* FROM runs r LEFT JOIN run_summary s ON s.run_id = r.id WHERE r.id = $1`,
    [id],
  );
  if (!run) return null;
  const [warnings, events, traj] = await Promise.all([
    query(`SELECT seq, severity, code, message, t_s FROM run_warnings WHERE run_id = $1 ORDER BY seq`, [id]),
    query(`SELECT seq, t_s, kind, label, detail FROM run_events WHERE run_id = $1 ORDER BY seq`, [id]),
    one<{ sample_hz: number; column_names: string[]; payload: Buffer; encoding: string; n_samples: number; pinned: boolean }>(
      `SELECT sample_hz, column_names, payload, encoding, n_samples, pinned
         FROM trajectories WHERE run_id = $1`, [id]),
  ]);
  return { run, warnings, events, trajectory: traj };
}

/** An identical specification already solved. The reason spec_hash is indexed. */
export async function findBySpecHash(specHash: string): Promise<{ id: string } | null> {
  return one<{ id: string }>(
    `SELECT r.id FROM runs r JOIN trajectories t ON t.run_id = r.id
      WHERE r.spec_hash = $1 ORDER BY r.created_at DESC LIMIT 1`,
    [specHash],
  );
}
