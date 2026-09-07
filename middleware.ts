import { NextResponse, type NextRequest } from "next/server";
import { AUTH, isApiRequest, isConsoleRequest, isPublicPath } from "@/lib/auth/config";
import { cookieOptions, readSession, shouldRefresh, signSession } from "@/lib/auth/session";

/**
 * The gate.
 *
 * Runs on the Edge, so it verifies a signed cookie and never touches the
 * database. The solver API is gated alongside the console: the console is
 * useless without it, and an open solver endpoint hands out the whole model to
 * anyone who finds the URL.
 *
 * An unauthenticated page request is redirected to the login page. An
 * unauthenticated API request gets 401 JSON instead, because a fetch cannot do
 * anything sensible with a redirect to an HTML form.
 *
 * Whether a request is "the console" is asked of lib/auth/config, which today
 * answers by path and can be switched to answer by host without touching this
 * file.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const host = req.headers.get("host");
  const console_ = isConsoleRequest(pathname, host);
  const api = isApiRequest(pathname);
  const gated = (console_ || api) && !isPublicPath(pathname);

  if (!gated) return harden(NextResponse.next(), console_);

  const token = req.cookies.get(AUTH.cookieName)?.value;
  const claims = await readSession(token);

  if (!claims) {
    if (api) {
      return harden(
        NextResponse.json(
          { ok: false, error: "Not authenticated.", detail: "Sign in at " + AUTH.loginPath },
          { status: 401 },
        ),
        true,
      );
    }
    const url = req.nextUrl.clone();
    url.pathname = AUTH.loginPath;
    url.search = "";
    // Where to come back to, so a deep link survives the detour.
    url.searchParams.set("next", pathname + (req.nextUrl.search || ""));
    return harden(NextResponse.redirect(url), true);
  }

  const res = NextResponse.next();
  res.headers.set("x-operator", claims.sub);

  // Slide the expiry forward while the operator is active. The absolute
  // ceiling is carried in the token and checked on every verify, so this
  // cannot extend a session past it.
  if (shouldRefresh(claims)) {
    const refreshed = await signSession({
      sub: claims.sub,
      email: claims.email,
      role: claims.role,
      sst: claims.sst,
    });
    res.cookies.set({ ...cookieOptions(AUTH.sessionSeconds), value: refreshed });
  }
  return harden(res, true);
}

/**
 * Security headers.
 *
 * `unsafe-inline` for styles and `unsafe-eval` in development are what the
 * framework needs to run; tightening them means nonces on every response,
 * which would make the static marketing page dynamic. The trade is recorded
 * rather than hidden.
 *
 * The console additionally gets frame-ancestors none and X-Frame-Options DENY:
 * an instrument panel that can be framed can be clickjacked.
 */
function harden(res: NextResponse, isConsole: boolean): NextResponse {
  const dev = process.env.NODE_ENV === "development";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    // data: and blob: are load-bearing: the trajectory arrives as a base64
    // buffer decoded through a data URL, and the WebGL canvas reads blobs.
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' data: blob:" + (dev ? " ws: http://127.0.0.1:*" : ""),
    "worker-src 'self' blob:",
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    isConsole ? "frame-ancestors 'none'" : "frame-ancestors 'self'",
  ].join("; ");

  res.headers.set("Content-Security-Policy", csp);
  res.headers.set("Referrer-Policy", "no-referrer");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", isConsole ? "DENY" : "SAMEORIGIN");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  if (isConsole) {
    res.headers.set("Cache-Control", "no-store, max-age=0");
    res.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  }
  return res;
}

export const config = {
  // Everything except the static asset pipeline: the gate needs /admin-pro and
  // /api, and the headers are worth setting on the public pages too.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|.*\\.(?:png|jpg|jpeg|svg|glb|woff2?)$).*)"],
};
