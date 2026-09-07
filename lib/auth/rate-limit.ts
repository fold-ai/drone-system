/**
 * Login rate limiting, by address and by account.
 *
 * Both, because they stop different attacks. Per-address stops one machine
 * working through a password list; per-account stops a distributed attempt
 * against one operator. An attacker who controls many addresses is still
 * bounded by the account limit.
 *
 * Attempts live in Postgres rather than in memory: serverless instances are
 * created and discarded constantly, and an in-memory counter would reset
 * itself often enough to be no limit at all.
 */
import { AUTH } from "./config";
import { query } from "@/lib/db";

export interface LimitVerdict {
  allowed: boolean;
  reason?: string;
  retryAfterSeconds?: number;
}

export async function checkLoginAllowed(ip: string, email: string): Promise<LimitVerdict> {
  const rows = await query<{ scope: string; failures: string; oldest: Date }>(
    `SELECT scope, COUNT(*)::text AS failures, MIN(created_at) AS oldest
       FROM login_attempts
      WHERE succeeded = FALSE
        AND created_at > NOW() - ($1::int * INTERVAL '1 second')
        AND ((scope = 'ip' AND identifier = $2) OR (scope = 'account' AND identifier = $3))
      GROUP BY scope`,
    [AUTH.rateLimit.windowSeconds, ip, email.toLowerCase()],
  );

  for (const row of rows) {
    const failures = Number(row.failures);
    const limit = row.scope === "ip" ? AUTH.rateLimit.perIp : AUTH.rateLimit.perAccount;
    if (failures >= limit) {
      const elapsed = (Date.now() - new Date(row.oldest).getTime()) / 1000;
      return {
        allowed: false,
        reason:
          row.scope === "ip"
            ? "Too many failed attempts from this address."
            : "Too many failed attempts against this account.",
        retryAfterSeconds: Math.max(
          1,
          Math.ceil(AUTH.rateLimit.windowSeconds - elapsed),
        ),
      };
    }
  }
  return { allowed: true };
}

export async function recordAttempt(
  ip: string,
  email: string,
  succeeded: boolean,
): Promise<void> {
  await query(
    `INSERT INTO login_attempts (scope, identifier, succeeded) VALUES
       ('ip', $1, $3), ('account', $2, $3)`,
    [ip, email.toLowerCase(), succeeded],
  );
}

/** A success clears the account's failures so one bad day does not lock it out. */
export async function clearAccountFailures(email: string): Promise<void> {
  await query(
    `DELETE FROM login_attempts
      WHERE scope = 'account' AND identifier = $1 AND succeeded = FALSE`,
    [email.toLowerCase()],
  );
}
