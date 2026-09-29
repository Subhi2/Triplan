import { sql } from "drizzle-orm";
import type { GeocodeResult } from "@/lib/trip";
import { getDb } from "../db";

interface NameMatchRow extends Record<string, unknown> {
  slug: string;
  name: string;
  district: string | null;
  state: string | null;
  osm_id: string | null;
  lng: number;
  lat: number;
}

/** One of our own places matching a search, with its OSM id to drop Photon duplicates. */
export interface LocalPlaceMatch extends GeocodeResult {
  osmId: string | null;
}

/** Fuzzy (trigram) matches below this similarity are too loose: "kalasa" would find "Kalady". */
const MIN_FUZZY_SIMILARITY = 0.45;

/**
 * Our own verified places and towns matching a search, best match first:
 * exact name or alternative name ("Ooty" is an alt name of Udhagamandalam), then names starting
 * with the query, then names or alt names containing it, then close misspellings ("sakleshpura").
 * Towns first within each tier. Listed before Photon's suggestions. Uses the trigram indexes on
 * name and alt_names_text(alt_names).
 */
export async function searchPlacesByName(query: string, limit = 8): Promise<LocalPlaceMatch[]> {
  const q = query.trim();
  const escaped = q.replace(/[\\%_]/g, "\\$&");
  const contains = `%${escaped}%`;
  const startsWith = `${escaped}%`;
  const rows = await getDb().execute<NameMatchRow>(sql`
    SELECT p.slug, p.name, p.district, p.state, p.osm_id,
           ST_X(p.location::geometry) AS lng, ST_Y(p.location::geometry) AS lat
    FROM place p
    JOIN category c ON c.id = p.category_id
    WHERE p.status = 'verified'
      AND (p.name ILIKE ${contains}
           OR alt_names_text(p.alt_names) ILIKE ${contains}
           OR (p.name % ${q} AND similarity(p.name, ${q}) >= ${MIN_FUZZY_SIMILARITY}))
    ORDER BY
      CASE
        WHEN lower(p.name) = lower(${q})
          OR lower(${q}) = ANY (SELECT lower(a) FROM unnest(p.alt_names) a) THEN 0
        WHEN p.name ILIKE ${startsWith} THEN 1
        WHEN p.name ILIKE ${contains} OR alt_names_text(p.alt_names) ILIKE ${contains} THEN 2
        ELSE 3
      END,
      (c.slug = 'town') DESC,
      similarity(p.name, ${q}) DESC,
      p.name
    LIMIT ${limit * 2}`);

  // Two OSM features with the same name a few hundred metres apart are one stop for a rider.
  const kept: NameMatchRow[] = [];
  for (const r of rows) {
    const duplicate = kept.some(
      (k) =>
        k.name.toLowerCase() === r.name.toLowerCase() &&
        Math.abs(k.lat - r.lat) < 0.03 &&
        Math.abs(k.lng - r.lng) < 0.03,
    );
    if (!duplicate) kept.push(r);
  }

  return kept.slice(0, limit).map((r) => {
    const area = r.district ?? r.state;
    return {
      id: `place/${r.slug}`,
      name: r.name,
      label: area ? `${r.name}, ${area}` : r.name,
      location: [r.lng, r.lat],
      source: "local",
      osmId: r.osm_id,
    };
  });
}

export interface SitemapPlace {
  slug: string;
  updatedAt: Date;
  /** Has a curated guide, a photo or a Wikipedia article: worth more to searchers. */
  rich: boolean;
}

/**
 * Verified places that have a page worth indexing: every category in the place list (fuel
 * stations and towns only label and support routes). Richest first, capped for one sitemap file.
 */
export async function listSitemapPlaces(limit = 45000): Promise<SitemapPlace[]> {
  const rows = await getDb().execute<{ slug: string; updated_at: string | Date; rich: boolean }>(
    sql`
      SELECT p.slug, p.updated_at,
             (p.wikidata_id IS NOT NULL
               OR EXISTS (SELECT 1 FROM place_guide g WHERE g.place_id = p.id)
               OR EXISTS (SELECT 1 FROM media m WHERE m.place_id = p.id AND m.status = 'verified'))
               AS rich
      FROM place p
      JOIN category c ON c.id = p.category_id
      WHERE p.status = 'verified' AND c.slug NOT IN ('fuel', 'town')
      ORDER BY rich DESC, p.updated_at DESC
      LIMIT ${limit}`,
  );
  return rows.map((r) => ({ slug: r.slug, updatedAt: new Date(r.updated_at), rich: r.rich }));
}
