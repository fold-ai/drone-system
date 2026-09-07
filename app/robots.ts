import type { MetadataRoute } from "next";

/**
 * The console is disallowed here as a courtesy to well-behaved crawlers. It is
 * not the access control: that is middleware.ts and a signed session. A
 * robots rule only asks.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin-pro", "/api/"] }],
    sitemap: "https://actprove.com/sitemap.xml",
  };
}
