import { sql } from "drizzle-orm";
import { CATEGORIES } from "@/lib/categories";
import { getDb } from "../db";
import { category } from "../db/schema";
import type { OsmPlaceCandidate } from "./osmClassify";

export interface UpsertResult {
  inserted: number;
  updated: number;
  linked: number; // OSM id recorded on an existing curated/user place
  duplicates: number; // skipped: duplicates a curated/user place
}

/** Makes sure every category the import can produce exists. */
export async function ensureCategories(): Promise<void> {
  const rows = Object.entries(CATEGORIES).map(([slug, c]) => ({
    slug,
    name: c.name,
    icon: c.icon,
    weight: c.weight,
  }));
  await getDb().insert(category).values(rows).onConflictDoNothing({ target: category.slug });
}

/**
 * Upserts one tile of OSM places for `state`.
 * - A candidate that duplicates a curated or user-added place (similar name within 300 m, 3 km
 *   for towns) is not inserted; its OSM id is recorded on that place if it has none.
 * - Everything else is upserted on osm_id as status 'verified', source 'osm'. Updates never touch
 *   non-OSM rows, and keep a moderator's status (only 'closed' flips back to 'verified').
 */
export async function upsertOsmPlaces(
  candidates: OsmPlaceCandidate[],
  state: string,
): Promise<UpsertResult> {
  const result: UpsertResult = { inserted: 0, updated: 0, linked: 0, duplicates: 0 };
  if (candidates.length === 0) return result;

  const rows = candidates.map((c) => ({
    osm_id: c.osmId,
    slug: c.slug,
    name: c.name,
    alt_names: c.altNames,
    category: c.category,
    lng: c.location[0],
    lat: c.location[1],
    population: c.population,
    wikidata_id: c.wikidataId,
    osm_tags: c.osmTags,
  }));

  await getDb().transaction(async (tx) => {
    const matches = await tx.execute<{
      osm_id: string;
      place_id: string;
      population: number | null;
    }>(sql`
      WITH c AS (
        SELECT * FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb)
          AS c(osm_id text, name text, category text, lng float8, lat float8, population int)
      )
      SELECT DISTINCT ON (c.osm_id) c.osm_id, p.id AS place_id, c.population
      FROM c
      JOIN place p
        ON p.source <> 'osm'
       AND ST_DWithin(p.location, ST_SetSRID(ST_MakePoint(c.lng, c.lat), 4326)::geography,
                      CASE WHEN c.category = 'town' THEN 3000 ELSE 300 END)
       AND similarity(p.name, c.name) > 0.3
      JOIN category pc ON pc.id = p.category_id AND (pc.slug = 'town') = (c.category = 'town')
      ORDER BY c.osm_id, similarity(p.name, c.name) DESC`);

    const matched = new Set(matches.map((m) => m.osm_id));
    result.duplicates = matched.size;

    // One link per existing place (several OSM elements can match the same curated place).
    const links = [...new Map(matches.map((m) => [m.place_id, m])).values()];
    if (links.length > 0) {
      const linked = await tx.execute(sql`
        UPDATE place p
        SET osm_id = m.osm_id, population = coalesce(m.population, p.population)
        FROM jsonb_to_recordset(${JSON.stringify(links)}::jsonb)
          AS m(osm_id text, place_id uuid, population int)
        WHERE p.id = m.place_id
          AND p.osm_id IS NULL
          AND NOT EXISTS (SELECT 1 FROM place q WHERE q.osm_id = m.osm_id)
        RETURNING p.id`);
      result.linked = linked.length;
    }

    const rest = rows.filter((r) => !matched.has(r.osm_id));
    if (rest.length === 0) return;
    const upserted = await tx.execute<{ inserted: boolean }>(sql`
      INSERT INTO place (slug, name, alt_names, category_id, location, state, status, source,
                         osm_id, wikidata_id, population, osm_tags)
      SELECT c.slug, c.name, ARRAY(SELECT jsonb_array_elements_text(c.alt_names)), cat.id,
             ST_SetSRID(ST_MakePoint(c.lng, c.lat), 4326)::geography, ${state}, 'verified', 'osm',
             c.osm_id, c.wikidata_id, c.population, c.osm_tags
      FROM jsonb_to_recordset(${JSON.stringify(rest)}::jsonb)
        AS c(osm_id text, slug text, name text, alt_names jsonb, category text, lng float8,
             lat float8, population int, wikidata_id text, osm_tags jsonb)
      JOIN category cat ON cat.slug = c.category
      ON CONFLICT (osm_id) DO UPDATE SET
        name = excluded.name,
        alt_names = excluded.alt_names,
        category_id = excluded.category_id,
        location = excluded.location,
        state = excluded.state,
        wikidata_id = excluded.wikidata_id,
        population = excluded.population,
        osm_tags = excluded.osm_tags,
        status = CASE WHEN place.status = 'closed' THEN 'verified'::place_status ELSE place.status END
      WHERE place.source = 'osm'
      RETURNING (xmax = 0) AS inserted`);
    result.inserted = upserted.filter((r) => r.inserted).length;
    result.updated = upserted.length - result.inserted;
  });

  return result;
}

/** The database clock, so stale-row checks never depend on this machine's clock. */
export async function databaseNow(): Promise<string> {
  const [row] = await getDb().execute<{ now: string }>(sql`SELECT now()::text AS now`);
  return row!.now;
}

/**
 * After a complete import of a region, marks OSM places that were not seen in it as closed
 * (deleted or retagged in OpenStreetMap). Only call this when every tile succeeded.
 * `importStartedAt` must come from databaseNow().
 */
export async function closeStaleOsmPlaces(state: string, importStartedAt: string): Promise<number> {
  const rows = await getDb().execute(sql`
    UPDATE place SET status = 'closed'
    WHERE source = 'osm' AND state = ${state} AND status = 'verified'
      AND updated_at < ${importStartedAt}::timestamptz
    RETURNING id`);
  return rows.length;
}
