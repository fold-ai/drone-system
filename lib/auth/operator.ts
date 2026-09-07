import { cookies } from "next/headers";
import { AUTH } from "./config";
import { readSession, type SessionClaims } from "./session";

/**
 * The signed-in operator, inside a route handler.
 *
 * Middleware has already refused anything unauthenticated, so this returning
 * null means the handler was reached by a path the gate does not cover - worth
 * failing on rather than assuming.
 */
export async function currentOperator(): Promise<SessionClaims | null> {
  const jar = await cookies();
  return readSession(jar.get(AUTH.cookieName)?.value);
}
