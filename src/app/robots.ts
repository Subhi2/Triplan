import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";
import { countSitemapPlaces, SITEMAP_PLACES_PER_FILE } from "@/server/services/placeService";

// Lists every sitemap file: /sitemap.xml holds the first 40,000 places, /sitemaps/N.xml the rest.
export const revalidate = 86400;

export default async function robots(): Promise<MetadataRoute.Robots> {
  const base = siteUrl();
  const places = await countSitemapPlaces().catch(() => 0);
  const extra = Math.max(0, Math.ceil(places / SITEMAP_PLACES_PER_FILE) - 1);
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/"] }],
    sitemap: [
      `${base}/sitemap.xml`,
      ...Array.from({ length: extra }, (_, i) => `${base}/sitemaps/${i + 1}.xml`),
    ],
  };
}
