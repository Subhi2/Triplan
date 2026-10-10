import { siteUrl } from "@/lib/site";
import { placesSitemapXml } from "@/lib/sitemapXml";
import { listSitemapPlaces } from "@/server/services/placeService";

// Places past the first 40,000 (those are in /sitemap.xml): /sitemaps/1.xml, 2.xml... as listed
// in robots.txt. Rebuilt at most daily.
export const revalidate = 86400;

/** GET /sitemaps/1.xml -> the second file of place pages; 404 past the last. */
export async function GET(_request: Request, { params }: { params: Promise<{ part: string }> }) {
  const m = /^([1-9]\d{0,2})\.xml$/.exec((await params).part);
  if (!m) return new Response("Not found", { status: 404 });
  const places = await listSitemapPlaces(Number(m[1]));
  if (places.length === 0) return new Response("Not found", { status: 404 });
  return new Response(placesSitemapXml(siteUrl(), places), {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
