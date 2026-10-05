import type { LineString } from "geojson";
import { sql } from "drizzle-orm";
import type { LngLat } from "@/lib/geo";
import { TRENDING_MIN_SCORE, type PlaceAlong } from "@/lib/places";
import { getDb } from "../db";

export interface PlaceAlongRow {
  id: string;
  slug: string;
  name: string;
  category: string;
  location: LngLat;
  kmFromStart: number;
  detourM: number;
  ratingAvg: number | null;
  ratingCount: number;
  bestMonths: number[];
  thumbUrl: string | null;
  trendingScore: number;
  notable: boolean;
}

interface RawRow extends Record<string, unknown> {
  id: string;
  slug: string;
  name: string;
  category: string;
  lng: number;
  lat: number;
  km_from_start: number;
  detour_m: number;
  rating_avg: number | null;
  rating_count: number;
  best_months: number[];
  thumb_url: string | null;
  trending_score: number;
  notable: boolean;
}

/**
 * Verified places within `corridorM` of the route, ordered by km from start (places_along_route).
 * `categories` null means every category except towns.
 */
export async function placesAlong(
  geometry: LineString,
  corridorM: number,
  categories: string[] | null,
): Promise<PlaceAlongRow[]> {
  // sql.param keeps the array as one text[] parameter instead of spreading it.
  const rows = await getDb().execute<RawRow>(
    sql`SELECT * FROM places_along_route(${JSON.stringify(geometry)}, ${Math.round(corridorM)},
          ${sql.param(categories)}::text[])`,
  );
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    category: r.category,
    location: [r.lng, r.lat],
    kmFromStart: Number(r.km_from_start),
    detourM: Number(r.detour_m),
    ratingAvg: r.rating_avg,
    ratingCount: r.rating_count,
    bestMonths: r.best_months,
    thumbUrl: r.thumb_url,
    trendingScore: r.trending_score,
    notable: r.notable,
  }));
}

export function toPlaceAlong(row: PlaceAlongRow): PlaceAlong {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.category,
    location: row.location,
    kmFromStart: row.kmFromStart,
    detourKm: row.detourM / 1000,
    rating: row.ratingAvg,
    ratingCount: row.ratingCount,
    bestMonths: row.bestMonths,
    thumbUrl: row.thumbUrl,
    trending: row.trendingScore >= TRENDING_MIN_SCORE,
    notable: row.notable,
  };
}

interface TownRawRow extends Record<string, unknown> {
  name: string;
  lng: number;
  lat: number;
  km_from_start: number;
  population: number | null;
  kind: string;
}

/** The OSM place type of a town row: city, town, or a well-known village (osmClassify). */
function townKind(place: string): "city" | "town" | "village" {
  return place === "city" || place === "village" ? place : "town";
}

export interface TownAlongRow {
  name: string;
  location: LngLat;
  kmFromStart: number;
  population: number | null;
  kind: "city" | "town" | "village";
}

/** Towns and cities within `withinM` of the route, ordered by km, with population for ranking. */
export async function townsAlong(geometry: LineString, withinM: number): Promise<TownAlongRow[]> {
  const rows = await getDb().execute<TownRawRow>(sql`
    WITH r AS (
      SELECT ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(geometry)}), 4326) AS g
    ), rl AS (
      SELECT g, ST_Length(g::geography) AS len,
             ST_Transform(ST_Simplify(ST_Transform(g, 3857), 50), 4326)::geography AS simple
      FROM r
    )
    SELECT p.name, ST_X(p.location::geometry) AS lng, ST_Y(p.location::geometry) AS lat,
           ST_LineLocatePoint(rl.g, p.location::geometry) * rl.len / 1000 AS km_from_start,
           p.population, coalesce(p.osm_tags->>'place', 'town') AS kind
    FROM place p
    JOIN category c ON c.id = p.category_id
    CROSS JOIN rl
    WHERE c.slug = 'town' AND p.status = 'verified'
      AND ST_DWithin(p.location, rl.simple, ${Math.round(withinM)})
    ORDER BY km_from_start`);
  return rows.map((r) => ({
    name: r.name,
    location: [r.lng, r.lat],
    kmFromStart: Number(r.km_from_start),
    population: r.population,
    kind: townKind(r.kind),
  }));
}

interface TownBoxRawRow extends Record<string, unknown> {
  name: string;
  lng: number;
  lat: number;
  population: number | null;
  kind: string;
}

/** Towns and cities inside a bounding box [west, south, east, north]. */
export async function townsInBox([west, south, east, north]: [number, number, number, number]) {
  const rows = await getDb().execute<TownBoxRawRow>(sql`
    SELECT p.name, ST_X(p.location::geometry) AS lng, ST_Y(p.location::geometry) AS lat,
           p.population, coalesce(p.osm_tags->>'place', 'town') AS kind
    FROM place p
    JOIN category c ON c.id = p.category_id
    WHERE c.slug = 'town' AND p.status = 'verified'
      AND p.location && ST_MakeEnvelope(${west}, ${south}, ${east}, ${north}, 4326)::geography`);
  return rows.map((r) => ({
    name: r.name,
    location: [r.lng, r.lat] as LngLat,
    population: r.population,
    kind: townKind(r.kind),
  }));
}
