/**
 * What is gated, and how the gate decides.
 *
 * The console is reached today at /admin-pro. If it moves to its own host later
 * - admin.actprove.com - flip `strategy` to "host" and set CONSOLE_HOST. The
 * middleware asks this module whether a request is for the console and never
 * looks at the path itself, so that move is a configuration change rather than
 * a rewrite of the gate.
 */
export type GateStrategy = "path" | "host";

export const AUTH = {
  strategy: (process.env.CONSOLE_GATE_STRATEGY as GateStrategy) ?? "path",

  /** Path prefix the console lives under, when gating by path. */
  consolePrefix: "/admin-pro",

  /** Host the console lives on, when gating by host. */
  consoleHost: process.env.CONSOLE_HOST ?? "admin.actprove.com",

  /** Where an unauthenticated request is sent. Must itself be public. */
  loginPath: "/admin-pro/login",

  /** Solver endpoints. Gated: an open solver endpoint leaks the whole model. */
  apiPrefix: "/api",

  /** Routes that must stay reachable without a session. */
  publicPaths: ["/admin-pro/login", "/auth/login", "/auth/logout"],

  cookieName: "actprove_session",

  /** Short expiry, refreshed while the operator is active. */
  sessionSeconds: 30 * 60,

  /** Hard ceiling from first sign-in, regardless of activity. */
  absoluteSessionSeconds: 12 * 60 * 60,

  /** Refresh once the session is this far through its life. */
  refreshAfterFraction: 0.5,

  rateLimit: {
    /** Failures allowed from one address before it is locked out. */
    perIp: 20,
    /** Failures allowed against one account before it is locked out. */
    perAccount: 8,
    windowSeconds: 15 * 60,
  },
} as const;

export function isConsoleRequest(pathname: string, host: string | null): boolean {
  if (AUTH.strategy === "host") {
    return (host ?? "").split(":")[0].toLowerCase() === AUTH.consoleHost.toLowerCase();
  }
  return pathname === AUTH.consolePrefix || pathname.startsWith(`${AUTH.consolePrefix}/`);
}

export function isApiRequest(pathname: string): boolean {
  return pathname === AUTH.apiPrefix || pathname.startsWith(`${AUTH.apiPrefix}/`);
}

export function isPublicPath(pathname: string): boolean {
  return AUTH.publicPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
