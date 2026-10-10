import { sql } from "drizzle-orm";
import { CATEGORIES } from "@/lib/categories";
import { getDb } from "../db";
import { category } from "../db/schema";
import type { OsmCurrentProvider } from "../providers/osm/osmApi";
import type { OsmPlaceCandidate } from "./osmClassify";
import { closeLimit, planClosures, type CloseCandidate, type ClosePlan } from "./osmClose";

export interface UpsertResult {
  inserted: number;
  updated: number;
  linked: number; // OSM id recorded on an existing curated/user place
  duplicates: number; // skipped: duplicates a curated/user place
}

/**
 * Makes sure every category the import can produce exists, with the name, icon and ranking
 * weight in src/lib/categories.ts (the database drifted when weights changed in code).
 */
export async function ensureCategories(): Promise<void> {
  const rows = Object.entries(CATEGORIES).map(([slug, c]) => ({
    slug,
    name: c.name,
    icon: c.icon,
    weight: c.weight,
  }));
  await getDb()
    .insert(category)
    .values(rows)
    .onConflictDoUpdate({
      target: category.slug,
      set: { name: sql`excluded.name`, icon: sql`excluded.icon`, weight: sql`excluded.weight` },
    });
}

/**
 * Closes OSM places the classifier now drops as duplicates of another place in the same tile
 * (splitDuplicates): left open, the OSM API check would keep them, since they still exist.
 */
export async function closeOsmDuplicates(osmIds: string[]): Promise<number> {
  if (osmIds.length === 0) return 0;
  const rows = await getDb().execute(sql`
    UPDATE place SET status = 'closed'
    WHERE source = 'osm' AND status = 'verified'
      AND osm_id IN (SELECT jsonb_array_elements_text(${JSON.stringify(osmIds)}::jsonb))
    RETURNING id`);
  return rows.length;
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
    // A park's outline as lines; PostGIS joins them into a polygon below.
    outline: c.outline ? JSON.stringify({ type: "MultiLineString", coordinates: c.outline }) : null,
  }));

  await getDb().transaction(async (tx) => {
    const matches = await tx.execute<{
      osm_id: string;
      place_id: string;
      population: number | null;
      wikidata_id: string | null;
      osm_tags: Record<string, string>;
    }>(sql`
      WITH c AS (
        SELECT * FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb)
          AS c(osm_id text, name text, category text, lng float8, lat float8, population int,
               wikidata_id text, osm_tags jsonb)
      )
      SELECT DISTINCT ON (c.osm_id) c.osm_id, p.id AS place_id, c.population, c.wikidata_id,
             c.osm_tags
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

    // One link per existing place (several OSM elements can match the same curated place). The
    // curated place also takes the element's Wikidata id and tags when it has none, so the photo
    // and description imports find it (Belur and Halebidu had no photo).
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
      // Newly or earlier linked: fill what the curated row lacks.
      await tx.execute(sql`
        UPDATE place p
        SET wikidata_id = coalesce(p.wikidata_id, m.wikidata_id),
            osm_tags = coalesce(p.osm_tags, m.osm_tags)
        FROM jsonb_to_recordset(${JSON.stringify(links)}::jsonb)
          AS m(osm_id text, place_id uuid, wikidata_id text, osm_tags jsonb)
        WHERE p.id = m.place_id AND p.osm_id = m.osm_id
          AND ((p.wikidata_id IS NULL AND m.wikidata_id IS NOT NULL) OR p.osm_tags IS NULL)`);
    }

    const rest = rows.filter((r) => !matched.has(r.osm_id));
    if (rest.length === 0) return;
    // Outlines: the lines joined into polygons (ST_BuildArea), made valid, simplified to about
    // 100 m; the place's point goes inside the outline. A broken outline is left out (null).
    const upserted = await tx.execute<{ inserted: boolean }>(sql`
      INSERT INTO place (slug, name, alt_names, category_id, location, area, state, status, source,
                         osm_id, wikidata_id, population, osm_tags)
      SELECT c.slug, c.name, ARRAY(SELECT jsonb_array_elements_text(c.alt_names)), cat.id,
             coalesce(ST_PointOnSurface(o.area::geometry)::geography,
                      ST_SetSRID(ST_MakePoint(c.lng, c.lat), 4326)::geography),
             o.area, ${state}, 'verified', 'osm',
             c.osm_id, c.wikidata_id, c.population, c.osm_tags
      FROM jsonb_to_recordset(${JSON.stringify(rest)}::jsonb)
        AS c(osm_id text, slug text, name text, alt_names jsonb, category text, lng float8,
             lat float8, population int, wikidata_id text, osm_tags jsonb, outline text)
      JOIN category cat ON cat.slug = c.category
      LEFT JOIN LATERAL (
        SELECT CASE WHEN ST_IsEmpty(a) THEN NULL ELSE a::geography END AS area
        FROM (
          SELECT ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SimplifyPreserveTopology(
                   ST_BuildArea(ST_SetSRID(ST_GeomFromGeoJSON(c.outline), 4326)), 0.001)), 3)) AS a
        ) built
        WHERE c.outline IS NOT NULL
      ) o ON true
      ON CONFLICT (osm_id) DO UPDATE SET
        name = excluded.name,
        alt_names = excluded.alt_names,
        category_id = excluded.category_id,
        location = excluded.location,
        area = excluded.area,
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

/** Above this many unseen places the import is clearly broken: refuse before asking the OSM API. */
const MAX_CLOSE_CHECKS = 5000;

/**
 * After a complete import of a region, closes the OSM places it did not see, but only those
 * OpenStreetMap confirms are deleted or no longer a place we import (src/server/services/osmClose.ts).
 * Unseen places that are still in OpenStreetMap stay open. More than 3% of the state's open places
 * at once is refused unless `force`. Only call this when every tile succeeded.
 * `importStartedAt` must come from databaseNow().
 */
export async function closeStaleOsmPlaces(
  state: string,
  importStartedAt: string,
  { osm, force = false }: { osm: OsmCurrentProvider; force?: boolean },
): Promise<ClosePlan & { candidates: number }> {
  const db = getDb();
  const unseen = await db.execute<{
    id: string;
    osm_id: string;
    name: string;
    category: string;
    lng: number;
    lat: number;
  }>(sql`
    SELECT p.id, p.osm_id, p.name, c.slug AS category,
      ST_X(p.location::geometry) AS lng, ST_Y(p.location::geometry) AS lat
    FROM place p JOIN category c ON c.id = p.category_id
    WHERE p.source = 'osm' AND p.state = ${state} AND p.status = 'verified'
      AND p.osm_id IS NOT NULL AND p.updated_at < ${importStartedAt}::timestamptz`);
  const [open] = await db.execute<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM place
    WHERE source = 'osm' AND state = ${state} AND status = 'verified'`);
  const candidates: CloseCandidate[] = unseen.map((r) => ({
    id: r.id,
    osmId: r.osm_id,
    name: r.name,
    category: r.category,
    location: [r.lng, r.lat],
  }));
  const openInState = open?.n ?? 0;

  if (candidates.length === 0) {
    return { ...planClosures([], new Map(), openInState), candidates: 0 };
  }
  if (candidates.length > MAX_CLOSE_CHECKS && !force) {
    return {
      close: [],
      stillThere: [],
      unchecked: candidates,
      limit: closeLimit(openInState),
      refused: true,
      candidates: candidates.length,
    };
  }

  const current = await osm.fetchCurrent(candidates.map((c) => c.osmId));
  const plan = planClosures(candidates, current, openInState, { force });
  if (!plan.refused && plan.close.length > 0) {
    const ids = plan.close.map((c) => c.place.id);
    await db.execute(sql`
      UPDATE place SET status = 'closed'
      WHERE id IN (SELECT jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb)::uuid)
        AND status = 'verified'`);
  }
  return { ...plan, candidates: candidates.length };
}
