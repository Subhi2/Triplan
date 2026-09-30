import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";
import { listSitemapPlaces } from "@/server/services/placeService";

// Rebuilt at most daily; the OSM import and new photos change it slowly.
export const revalidate = 86400;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const places = await listSitemapPlaces();
  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/nearby`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/trips`, changeFrequency: "daily", priority: 0.5 },
    ...places.map((p) => ({
      url: `${base}/place/${p.slug}`,
      lastModified: p.updatedAt,
      changeFrequency: "monthly" as const,
      priority: p.rich ? 0.8 : 0.4,
    })),
  ];
}
