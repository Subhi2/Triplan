import type { LineString } from "geojson";
import { sql } from "drizzle-orm";
import type { LngLat } from "@/lib/geo";
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
  }));
}
