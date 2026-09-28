import { sql } from "drizzle-orm";
import type { GeocodeResult } from "@/lib/trip";
import { getDb } from "../db";

interface NameMatchRow extends Record<string, unknown> {
  slug: string;
  name: string;
  district: string | null;
  lng: number;
  lat: number;
}

/**
 * Type-ahead over our own verified places and towns (substring or trigram match on name and
 * alt names). Public Nominatim forbids autocomplete, so as-you-type suggestions come from here.
 */
export async function searchPlacesByName(query: string, limit = 8): Promise<GeocodeResult[]> {
  const q = query.trim();
  const rows = await getDb().execute<NameMatchRow>(sql`
    SELECT p.slug, p.name, p.district,
           ST_X(p.location::geometry) AS lng, ST_Y(p.location::geometry) AS lat
    FROM place p
    JOIN category c ON c.id = p.category_id
    WHERE p.status = 'verified'
      AND (strpos(lower(p.name), lower(${q})) > 0
           OR similarity(p.name, ${q}) > 0.3
           OR EXISTS (SELECT 1 FROM unnest(p.alt_names) a WHERE strpos(lower(a), lower(${q})) > 0))
    ORDER BY (c.slug = 'town') DESC, similarity(p.name, ${q}) DESC, p.name
    LIMIT ${limit}`);
  return rows.map((r) => ({
    id: `place/${r.slug}`,
    name: r.name,
    label: r.district ? `${r.name}, ${r.district}` : r.name,
    location: [r.lng, r.lat],
    source: "local",
  }));
}
