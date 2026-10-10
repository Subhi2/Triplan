import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";
import { listSitemapPlaces } from "@/server/services/placeService";
import { rideSlugs } from "@/server/services/rideService";

// Rebuilt at most daily; the OSM import and new photos change it slowly. The main pages, the rides
// and the first 40,000 places; the other places are in /sitemaps/1.xml, 2.xml... (robots.txt).
export const revalidate = 86400;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const [places, rides] = await Promise.all([listSitemapPlaces(), rideSlugs().catch(() => [])]);
  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/nearby`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/rides`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${base}/about`, changeFrequency: "monthly", priority: 0.5 },
    ...rides.map((slug) => ({
      url: `${base}/rides/${slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.9,
    })),
    ...places.map((p) => ({
      url: `${base}/place/${p.slug}`,
      lastModified: p.updatedAt,
      changeFrequency: "monthly" as const,
      priority: p.rich ? 0.8 : 0.4,
    })),
  ];
}
