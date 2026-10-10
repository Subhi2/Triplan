import { describe, expect, it } from "vitest";
import { placesSitemapXml } from "@/lib/sitemapXml";

describe("placesSitemapXml", () => {
  it("lists place pages with their dates and priority, escaped", () => {
    const xml = placesSitemapXml("https://triplan.example", [
      { slug: "manjarabad-fort", updatedAt: new Date("2026-10-01T00:00:00Z"), rich: true },
      { slug: "a&b-n1", updatedAt: new Date("2026-10-02T00:00:00Z"), rich: false },
    ]);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain(
      "<url><loc>https://triplan.example/place/manjarabad-fort</loc><lastmod>2026-10-01T00:00:00.000Z</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>",
    );
    expect(xml).toContain("/place/a&amp;b-n1</loc>");
    expect(xml.match(/<url>/g)).toHaveLength(2);
  });
});
