#!/usr/bin/env node
/**
 * Schema smoke test.
 *
 * Writes one of everything and reads it back, including a trajectory payload of
 * realistic size. A schema nobody has inserted into is a guess; this is the
 * cheapest way to find out that a column is the wrong type or a constraint is
 * backwards.
 */
import { createHash, randomUUID } from "node:crypto";
import { deflateSync } from "node:zlib";
import pg from "pg";

const url = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
const client = new pg.Client({
  connectionString: url,
  ssl: /localhost|127\.0\.0\.1/.test(url ?? "") ? undefined : { rejectUnauthorized: false },
});
await client.connect();
await client.query("BEGIN");

const op = (await client.query("SELECT id FROM operators LIMIT 1")).rows[0]?.id ?? null;

const af = (await client.query(
  `INSERT INTO airframes (name, length_m, spec_json, planform_hash, created_by, notes)
   VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
  ["ACT-1 baseline", 2.0, JSON.stringify({ airframe: { length_m: 2.0 } }),
   createHash("sha256").update("planform-v2").digest("hex").slice(0, 32), op, "smoke"],
)).rows[0].id;

const specHash = createHash("sha256").update("spec").digest("hex").slice(0, 32);
const run = (await client.query(
  `INSERT INTO runs (airframe_id, spec_hash, spec_json, kind, name, created_by,
                     solver_version, git_sha, wall_ms)
   VALUES ($1, $2, $3, 'single', 'smoke run', $4, '2.0.0', 'deadbeef', 612) RETURNING id`,
  [af, specHash, JSON.stringify({ mission: {} }), op],
)).rows[0].id;

await client.query(
  `INSERT INTO run_summary (run_id, range_km, endurance_s, ld_max, max_mach, fuel_burn_kg,
                            v_rail_exit_ms, max_load_factor, feasible, warning_count)
   VALUES ($1, 33.5, 560, 5.78, 0.3023, 3.0, 18.4, 2.1, TRUE, 3)`,
  [run],
);
await client.query(
  `INSERT INTO run_warnings (run_id, seq, severity, code, message, t_s)
   VALUES ($1, 0, 'advisory', 'mach1', 'Level flight at M 1.0 needs 4973 N', NULL)`,
  [run],
);
await client.query(
  `INSERT INTO run_events (run_id, seq, t_s, kind, label) VALUES ($1, 0, 0.0, 'release', 'Rail release')`,
  [run],
);

// A realistic payload: 41 columns of 18 000 float32 samples, shuffled and deflated
// the way the solver encodes it.
const n = 18000, cols = 41;
const raw = Buffer.alloc(n * cols * 4);
for (let i = 0; i < raw.length; i += 4) raw.writeFloatLE(Math.sin(i * 1e-4), i);
const planes = Buffer.concat([0, 1, 2, 3].map((k) => {
  const p = Buffer.alloc(raw.length / 4);
  for (let i = 0; i < p.length; i += 1) p[i] = raw[i * 4 + k];
  return p;
}));
const payload = deflateSync(planes);
await client.query(
  `INSERT INTO trajectories (run_id, sample_hz, column_names, payload, n_samples, bytes)
   VALUES ($1, 50, $2, $3, $4, $5)`,
  [run, Array.from({ length: cols }, (_, i) => `c${i}`), payload, n, payload.length],
);

const bench = (await client.query(
  `INSERT INTO bench_runs (source, kind, recorded_at, uploaded_by, csv, row_count, notes)
   VALUES ('test stand 3', 'engine', NOW(), $1, $2, 11, 'smoke') RETURNING id`,
  [op, Buffer.from("throttle,thrust,fuel_flow\n1.0,250.2,0.0101\n")],
)).rows[0].id;
await client.query(
  `INSERT INTO validation_points (bench_run_id, run_id, quantity, measured, model, residual, unit)
   VALUES ($1, $2, 'static_thrust_n', 250.2, 250.2, 0.0, 'N')`,
  [bench, run],
);

const opt = (await client.query(
  `INSERT INTO optimisations (objective, algorithm, n_evals, status, created_by, solver_version)
   VALUES ('range_km', 'cma-es', 0, 'queued', $1, '2.0.0') RETURNING id`, [op],
)).rows[0].id;
await client.query("UPDATE runs SET optimisation_id = $1 WHERE id = $2", [opt, run]);

await client.query(
  `INSERT INTO ai_reviews (run_id, model, prompt_hash, source_json, response_json,
                           prompt_tokens, completion_tokens, token_cost)
   VALUES ($1, 'gpt-5', $2, '{}'::jsonb, '{}'::jsonb, 1200, 400, 0.0182)`,
  [run, createHash("sha256").update("prompt").digest("hex")],
);

const back = (await client.query(
  `SELECT r.name, r.solver_version, s.range_km, t.n_samples, t.bytes, t.pinned,
          octet_length(t.payload) AS stored_bytes, array_length(t.column_names, 1) AS ncols
     FROM runs r JOIN run_summary s ON s.run_id = r.id
     JOIN trajectories t ON t.run_id = r.id WHERE r.id = $1`, [run],
)).rows[0];

console.log("  wrote and read back:");
console.log(`    run "${back.name}" solver ${back.solver_version}, range ${back.range_km} km`);
console.log(`    trajectory ${back.n_samples} samples x ${back.ncols} columns`);
console.log(`    payload ${(back.stored_bytes / 1e6).toFixed(2)} MB stored, ` +
            `${(n * cols * 4 / 1e6).toFixed(2)} MB raw, pinned=${back.pinned}`);
const idx = (await client.query(
  `SELECT indexname FROM pg_indexes WHERE tablename = 'runs' ORDER BY indexname`)).rows;
console.log("    runs indexes: " + idx.map((r) => r.indexname).join(", "));

await client.query("ROLLBACK");
await client.end();
console.log("  rolled back; the database is unchanged");
