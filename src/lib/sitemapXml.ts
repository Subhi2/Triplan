/** A sitemap file of place pages (https://www.sitemaps.org/protocol.html). */
export function placesSitemapXml(
  base: string,
  places: { slug: string; updatedAt: Date; rich: boolean }[],
): string {
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const urls = places.map(
    (p) =>
      `<url><loc>${escape(`${base}/place/${p.slug}`)}</loc>` +
      `<lastmod>${p.updatedAt.toISOString()}</lastmod><changefreq>monthly</changefreq>` +
      `<priority>${p.rich ? "0.8" : "0.4"}</priority></url>`,
  );
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.join("\n") +
    "\n</urlset>\n"
  );
}
