import type { MetadataRoute } from "next";

/** Public routes only. The console is never listed. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://actprove.com/",
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 1,
    },
  ];
}
