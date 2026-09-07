import type { NextConfig } from "next";

/**
 * In production Vercel serves /api/*.py as Python serverless functions.
 * `next dev` does not know about those, so in development the same routes are
 * proxied to scripts/dev_api.py, which imports the identical handlers.
 *
 * The proxy is a `beforeFiles` rewrite so it is matched ahead of the App
 * Router's filesystem routes. As an `afterFiles` rewrite the public catch-all
 * would claim /api first and the solver would be unreachable in development.
 */
const config: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  async rewrites() {
    if (process.env.NODE_ENV !== "development") return { beforeFiles: [], afterFiles: [], fallback: [] };
    const port = process.env.ACT1_API_PORT ?? "8787";
    return {
      beforeFiles: [{ source: "/api/:path*", destination: `http://127.0.0.1:${port}/api/:path*` }],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default config;
