import type { LineString } from "geojson";
import { sql } from "drizzle-orm";
import { getDb } from "../db";
import type { PlaceAlongRow } from "./corridorService";
import type { OpenPlaceCandidate, OpenPlaceCategory } from "./openPlaceClassify";

// Open places (docs/02, "Open places from Overture"): fuel, food and coffee from Overture, for the
// break planner and the fuel gap. They have no pages, so their rows carry an empty slug.

export const OPEN_PLACE_KINDS: readonly OpenPlaceCategory[] = ["fuel", "food", "coffee"];

/** Within this distance and with a similar name (pg_trgm), an open place is one we already have. */
export const SAME_PLACE_M = 150;
export const SIMILAR_NAME = 0.4;
/** At most this many of a category in one cell of about 2 km: busy city streets are trimmed. */
export const CELL_DEG = 0.02;
export const PER_CELL: Record<OpenPlaceCategory, number | null> = {
  fuel: null, // every pump: a rider low on fuel wants the nearest
  food: 3,
  coffee: 2,
};

interface RawRow extends Record<string, unknown> {
  id: string;
  name: string;
  category: string;
  lng: number;
  lat: number;
  km_from_start: number;
  detour_m: number;
}

/** Open places within `corridorM` of the route in the given categories, by km from start. */
export async function openPlacesAlong(
  geometry: LineString,
  corridorM: number,
  categories: readonly string[],
): Promise<PlaceAlongRow[]> {
  const wanted = OPEN_PLACE_KINDS.filter((k) => categories.includes(k));
  if (wanted.length === 0) return [];
  const rows = await getDb().execute<RawRow>(
    sql`SELECT * FROM open_places_along_route(${JSON.stringify(geometry)}, ${Math.round(corridorM)},
          ${sql.param(wanted)}::text[])`,
  );
  return rows.map((r) => ({
    id: r.id,
    slug: "",
    name: r.name,
    category: r.category,
    location: [r.lng, r.lat],
    kmFromStart: Number(r.km_from_start),
    detourM: Number(r.detour_m),
    ratingAvg: null,
    ratingCount: 0,
    bestMonths: [],
    thumbUrl: null,
    trendingScore: 0,
    notable: false,
  }));
}

export interface OpenPlaceImportCounts {
  read: number;
  /** Outside the region's districts (a neighbouring state or country in the box). */
  outside: number;
  /** One of ours already (a place or a service point). */
  ours: number;
  /** Over the per-cell cap. */
  capped: number;
  written: number;
}

/**
 * Writes one region's candidates: keeps those inside the region's districts, drops ones we
 * already have (any of our fuel within 150 m, or any place or service point within 150 m with a
 * similar name), keeps the most confident few per cell, and upserts the rest on Overture's id.
 */
export async function upsertOpenPlaces(
  candidates: OpenPlaceCandidate[],
  region: string,
  release: string,
): Promise<OpenPlaceImportCounts> {
  const caps = Object.entries(PER_CELL).map(([category, cap]) => ({ category, cap }));
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`
      CREATE TEMP TABLE open_import (
        id text PRIMARY KEY, name text, category text, location geography(Point, 4326),
        confidence real, license text, datasets text[]
      ) ON COMMIT DROP`);
    for (let i = 0; i < candidates.length; i += 2000) {
      const chunk = candidates.slice(i, i + 2000).map((c) => ({
        id: c.externalId,
        name: c.name,
        category: c.category,
        lng: c.location[0],
        lat: c.location[1],
        confidence: c.confidence,
        license: c.license,
        datasets: c.datasets,
      }));
      await tx.execute(sql`
        INSERT INTO open_import
        SELECT x.id, x.name, x.category, ST_SetSRID(ST_MakePoint(x.lng, x.lat), 4326)::geography,
               x.confidence, x.license, x.datasets
        FROM jsonb_to_recordset(${JSON.stringify(chunk)}::jsonb) AS x(
          id text, name text, category text, lng float8, lat float8, confidence real,
          license text, datasets text[])
        ON CONFLICT (id) DO NOTHING`);
    }
    const [counts] = await tx.execute<{
      inside: number;
      ours: number;
      kept: number;
      written: number;
    }>(sql`
      WITH inside AS (
        SELECT o.* FROM open_import o
        WHERE EXISTS (SELECT 1 FROM district d
                      WHERE d.region = ${region} AND ST_Intersects(d.geom, o.location))
      ), fresh AS (
        SELECT i.* FROM inside i
        WHERE NOT EXISTS (
            -- A pump is listed by brand in one dataset and by dealer in the other.
            SELECT 1 FROM place p JOIN category c ON c.id = p.category_id
            WHERE i.category = 'fuel' AND c.slug = 'fuel'
              AND ST_DWithin(p.location, i.location, ${SAME_PLACE_M}))
          AND NOT EXISTS (
            SELECT 1 FROM place p WHERE ST_DWithin(p.location, i.location, ${SAME_PLACE_M})
              AND similarity(p.name, i.name) > ${SIMILAR_NAME})
          AND NOT EXISTS (
            SELECT 1 FROM service_point s WHERE ST_DWithin(s.location, i.location, ${SAME_PLACE_M})
              AND similarity(coalesce(s.name, ''), i.name) > ${SIMILAR_NAME})
      ), ranked AS (
        SELECT f.*, row_number() OVER (
                 PARTITION BY f.category,
                   floor(ST_X(f.location::geometry) / ${CELL_DEG}),
                   floor(ST_Y(f.location::geometry) / ${CELL_DEG})
                 ORDER BY f.confidence DESC, f.id) AS rn
        FROM fresh f
      ), kept AS (
        SELECT r.* FROM ranked r
        JOIN jsonb_to_recordset(${JSON.stringify(caps)}::jsonb) AS cap(category text, cap int)
          ON cap.category = r.category
        WHERE cap.cap IS NULL OR r.rn <= cap.cap
      ), written AS (
        INSERT INTO open_place AS op
          (id, name, category, location, confidence, license, datasets, region, release)
        SELECT id, name, category, location, confidence, license, datasets, ${region}, ${release}
        FROM kept
        ON CONFLICT (id) DO UPDATE SET
          name = excluded.name, category = excluded.category, location = excluded.location,
          confidence = excluded.confidence, license = excluded.license,
          datasets = excluded.datasets, region = excluded.region, release = excluded.release,
          updated_at = now()
        RETURNING 1
      )
      SELECT (SELECT count(*) FROM inside)::int AS inside,
             (SELECT count(*) FROM inside)::int - (SELECT count(*) FROM fresh)::int AS ours,
             (SELECT count(*) FROM kept)::int AS kept,
             (SELECT count(*) FROM written)::int AS written`);
    const inside = counts?.inside ?? 0;
    const ours = counts?.ours ?? 0;
    return {
      read: candidates.length,
      outside: candidates.length - inside,
      ours,
      capped: inside - ours - (counts?.kept ?? 0),
      written: counts?.written ?? 0,
    };
  });
}

/** Removes a region's rows that a complete run started at `startedAt` did not write again. */
export async function deleteStaleOpenPlaces(region: string, startedAt: string): Promise<number> {
  const rows = await getDb().execute(sql`
    DELETE FROM open_place WHERE region = ${region} AND updated_at < ${startedAt}::timestamptz
    RETURNING 1`);
  return rows.length;
}
