/**
 * Postgres.
 *
 * One pool per process, cached across hot reloads and across warm serverless
 * invocations. No ORM: the schema is small and the queries are analytical, and
 * an ORM would sit between us and the query plans that matter for trajectory
 * payloads.
 */
import { Pool, type PoolClient, type QueryResultRow } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __actprovePool: Pool | undefined;
}

export function connectionString(): string {
  const url =
    process.env.POSTGRES_URL ??
    process.env.DATABASE_URL ??
    process.env.POSTGRES_PRISMA_URL ??
    "";
  if (!url) {
    throw new Error(
      "No Postgres connection string. Set POSTGRES_URL (Vercel Postgres) or DATABASE_URL.",
    );
  }
  return url;
}

export function pool(): Pool {
  if (!globalThis.__actprovePool) {
    const url = connectionString();
    globalThis.__actprovePool = new Pool({
      connectionString: url,
      // Serverless invocations are short and many; a large pool per instance
      // exhausts the server's connection limit rather than helping.
      max: Number(process.env.PGPOOL_MAX ?? 3),
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 8_000,
      ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false },
    });
  }
  return globalThis.__actprovePool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await pool().query<T>(text, params);
  return res.rows;
}

export async function one<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/** Run a unit of work in a transaction, rolling back on any throw. */
export async function transaction<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export function isConfigured(): boolean {
  return Boolean(process.env.POSTGRES_URL ?? process.env.DATABASE_URL ?? process.env.POSTGRES_PRISMA_URL);
}
