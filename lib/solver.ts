import type { NextRequest } from "next/server";
import { AUTH } from "@/lib/auth/config";

/**
 * Reaching the solver from a route handler.
 *
 * The Python functions are gated by the same middleware as everything else, so
 * server-side callers present a shared internal token. In development the
 * solver runs on its own port and is reached directly, never passing through
 * middleware, so no token is needed there.
 *
 * Everything that must be auditable goes through here rather than through the
 * browser. A trail the client could fabricate is not a trail.
 */
export function solverUrl(req: NextRequest, path: string): string {
  const base =
    process.env.SOLVER_BASE_URL ??
    (process.env.NODE_ENV === "development"
      ? `http://127.0.0.1:${process.env.ACT1_API_PORT ?? "8787"}`
      : `${req.nextUrl.protocol}//${req.headers.get("host")}`);
  return `${base}${path}`;
}

export async function callSolver(
  req: NextRequest,
  path: string,
  body: unknown,
): Promise<Record<string, unknown>> {
  const token = process.env.INTERNAL_API_TOKEN;
  const res = await fetch(solverUrl(req, path), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { [AUTH.internalHeader]: token } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`solver returned ${res.status}: ${text.slice(0, 200)}`);
  }
  if (!res.ok || parsed.ok === false) {
    throw new Error(String(parsed.error ?? `solver returned ${res.status}`));
  }
  return parsed;
}
