/**
 * Session cookie.
 *
 * A signed JWT, verified in middleware on the Edge runtime, which is why there
 * is no database lookup here: the Edge has no Postgres client and a round trip
 * on every request would be the wrong design anyway.
 *
 * Two clocks. `exp` is short and slides forward while the operator is active.
 * `sst`, the session start time, does not, so an active session still ends at
 * the absolute ceiling. Refreshing the token cannot extend a session
 * indefinitely.
 */
// Submodule imports, not the barrel: the barrel pulls in JWE decryption, which
// reaches for CompressionStream and warns that it is unavailable on the Edge.
// Only JWS is used here.
import { SignJWT } from "jose/jwt/sign";
import { jwtVerify } from "jose/jwt/verify";
import { AUTH } from "./config";

export interface SessionClaims {
  sub: string;
  email: string;
  role: string;
  /** Session start, seconds since epoch. Survives refresh. */
  sst: number;
  iat: number;
  exp: number;
}

function secret(): Uint8Array {
  const raw = process.env.SESSION_SECRET;
  if (!raw || raw.length < 32) {
    throw new Error(
      "SESSION_SECRET is missing or shorter than 32 characters. Sessions cannot be signed.",
    );
  }
  return new TextEncoder().encode(raw);
}

export async function signSession(
  claims: { sub: string; email: string; role: string; sst?: number },
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const sst = claims.sst ?? now;
  return new SignJWT({ email: claims.email, role: claims.role, sst })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(claims.sub)
    .setIssuedAt(now)
    .setExpirationTime(now + AUTH.sessionSeconds)
    .sign(secret());
}

export async function readSession(token: string | undefined): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    const now = Math.floor(Date.now() / 1000);
    const sst = Number(payload.sst ?? 0);
    // The absolute ceiling is enforced here rather than only at sign-in, so a
    // stolen token cannot be refreshed forever.
    if (!sst || now - sst > AUTH.absoluteSessionSeconds) return null;
    return {
      sub: String(payload.sub ?? ""),
      email: String(payload.email ?? ""),
      role: String(payload.role ?? "operator"),
      sst,
      iat: Number(payload.iat ?? 0),
      exp: Number(payload.exp ?? 0),
    };
  } catch {
    return null;
  }
}

/** True once the token is far enough through its life to be worth re-issuing. */
export function shouldRefresh(claims: SessionClaims): boolean {
  const life = claims.exp - claims.iat;
  if (life <= 0) return false;
  const elapsed = Math.floor(Date.now() / 1000) - claims.iat;
  return elapsed / life >= AUTH.refreshAfterFraction;
}

export function cookieOptions(maxAgeSeconds: number) {
  return {
    name: AUTH.cookieName,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
