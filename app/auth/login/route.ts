import { NextResponse, type NextRequest } from "next/server";
import { AUTH } from "@/lib/auth/config";
import { verifyPassword } from "@/lib/auth/password";
import { checkLoginAllowed, clearAccountFailures, recordAttempt } from "@/lib/auth/rate-limit";
import { cookieOptions, signSession } from "@/lib/auth/session";
import { isConfigured, one, query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sign in.
 *
 * Under /auth rather than /api so it cannot collide with the Python solver
 * functions, which own /api/* on Vercel.
 *
 * The response is deliberately uniform: an unknown account and a wrong password
 * return the same message and take a comparable amount of time, so the endpoint
 * cannot be used to enumerate operators.
 */
export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  let email = "";
  let password = "";
  try {
    const body = (await req.json()) as { email?: string; password?: string };
    email = String(body.email ?? "").trim().toLowerCase();
    password = String(body.password ?? "");
  } catch {
    return NextResponse.json({ ok: false, error: "Malformed request." }, { status: 400 });
  }
  if (!email || !password) {
    return NextResponse.json({ ok: false, error: "Email and password are required." }, { status: 400 });
  }
  if (!isConfigured()) {
    return NextResponse.json(
      { ok: false, error: "No database is configured. Set POSTGRES_URL and run the migrations." },
      { status: 503 },
    );
  }

  const verdict = await checkLoginAllowed(ip, email);
  if (!verdict.allowed) {
    return NextResponse.json(
      { ok: false, error: verdict.reason, retryAfterSeconds: verdict.retryAfterSeconds },
      { status: 429, headers: { "Retry-After": String(verdict.retryAfterSeconds ?? 60) } },
    );
  }

  const operator = await one<{ id: string; email: string; password_hash: string; role: string }>(
    "SELECT id, email, password_hash, role FROM operators WHERE email = $1 AND disabled_at IS NULL",
    [email],
  );

  // Verify even when the account is unknown, against a fixed hash, so a missing
  // account and a wrong password cost the same time.
  const hash =
    operator?.password_hash ??
    "$argon2id$v=19$m=19456,t=2,p=1$YWN0cHJvdmVwbGFjZWhvbGRlcg$3s1ijQmYQ0KcT0eSPr6uJyTPEDXdPFO0lRygZUqbBK0";
  const ok = await verifyPassword(hash, password);

  if (!operator || !ok) {
    await recordAttempt(ip, email, false);
    return NextResponse.json(
      { ok: false, error: "Those credentials were not accepted." },
      { status: 401 },
    );
  }

  await recordAttempt(ip, email, true);
  await clearAccountFailures(email);
  await query("UPDATE operators SET last_login = NOW() WHERE id = $1", [operator.id]);

  const token = await signSession({
    sub: operator.id,
    email: operator.email,
    role: operator.role,
  });
  const res = NextResponse.json({ ok: true, email: operator.email, role: operator.role });
  res.cookies.set({ ...cookieOptions(AUTH.sessionSeconds), value: token });
  return res;
}
