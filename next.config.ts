import type { NextConfig } from "next";

/**
 * In production Vercel serves /api/*.py as Python serverless functions.
 * `next dev` does not know about those, so in development the same routes are
 * proxied to scripts/dev_api.py, which imports the identical handlers. The
 * browser therefore talks to one URL shape in both environments.
 */
const config: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  async rewrites() {
    if (process.env.NODE_ENV !== "development") return [];
    const port = process.env.REAPER_API_PORT ?? "8787";
    return [{ source: "/api/:path*", destination: `http://127.0.0.1:${port}/api/:path*` }];
  },
};

export default config;
