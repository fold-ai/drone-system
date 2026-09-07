#!/usr/bin/env node
/**
 * Migration runner.
 *
 * Forward-only, one transaction per migration, recorded in schema_migrations so
 * each runs exactly once. No ORM and no rollback: rolling a schema backwards in
 * production is a rewrite dressed as a button, and a forward fix is honest
 * about what happened.
 *
 * Steps are `.sql` files, or `.mjs` files exporting `up(client)` for the ones
 * SQL cannot express - hashing a seed password, for instance.
 *
 *     node db/migrate.mjs            apply everything pending
 *     node db/migrate.mjs --status   list applied and pending
 *     node db/migrate.mjs --dry-run  show what would run
 */
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, "migrations");

function connectionString() {
  const url =
    process.env.POSTGRES_URL ?? process.env.DATABASE_URL ?? process.env.POSTGRES_PRISMA_URL;
  if (!url) {
    console.error("No connection string. Set POSTGRES_URL or DATABASE_URL.");
    process.exit(2);
  }
  return url;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const url = connectionString();
  const client = new pg.Client({
    connectionString: url,
    ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false },
  });
  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name        text PRIMARY KEY,
      applied_at  timestamptz NOT NULL DEFAULT NOW(),
      duration_ms integer NOT NULL DEFAULT 0
    )
  `);

  const applied = new Set(
    (await client.query("SELECT name FROM schema_migrations")).rows.map((r) => r.name),
  );
  const files = (await readdir(DIR))
    .filter((f) => /^\d{4}_.+\.(sql|mjs)$/.test(f))
    .sort();
  const pending = files.filter((f) => !applied.has(f));

  if (args.has("--status")) {
    for (const f of files) console.log(`  ${applied.has(f) ? "applied" : "pending"}  ${f}`);
    console.log(`\n  ${applied.size} applied, ${pending.length} pending`);
    await client.end();
    return;
  }

  if (pending.length === 0) {
    console.log("  nothing to apply");
    await client.end();
    return;
  }

  for (const file of pending) {
    if (args.has("--dry-run")) {
      console.log(`  would apply  ${file}`);
      continue;
    }
    const started = Date.now();
    process.stdout.write(`  applying ${file} ... `);
    try {
      await client.query("BEGIN");
      if (file.endsWith(".sql")) {
        await client.query(await readFile(join(DIR, file), "utf8"));
      } else {
        const mod = await import(pathToFileURL(join(DIR, file)).href);
        if (typeof mod.up !== "function") {
          throw new Error(`${file} does not export up(client)`);
        }
        await mod.up(client);
      }
      const ms = Date.now() - started;
      await client.query(
        "INSERT INTO schema_migrations (name, duration_ms) VALUES ($1, $2)",
        [file, ms],
      );
      await client.query("COMMIT");
      console.log(`ok, ${ms} ms`);
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      console.log("failed");
      console.error(`\n  ${file}: ${err.message}\n`);
      await client.end();
      process.exit(1);
    }
  }
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
