import { sql } from "drizzle-orm";
import type { LngLat } from "@/lib/geo";
import { getDb } from "../db";

export interface PlaceNearRow {
  id: string;
  slug: string;
  name: string;
  category: string;
  location: LngLat;
  distanceM: number;
  ratingAvg: number | null;
  ratingCount: number;
  bestMonths: number[];
  thumbUrl: string | null;
  trendingScore: number;
  notable: boolean;
  /** Category weight, +1 when curated, +0.5 with a Wikidata link (as places_along_route). */
  priority: number;
}

interface RawRow extends Record<string, unknown> {
  id: string;
  slug: string;
  name: string;
  category: string;
  lng: number;
  lat: number;
  distance_m: number;
  rating_avg: number | null;
  rating_count: number;
  best_months: number[];
  thumb_url: string | null;
  trending_score: number;
  notable: boolean;
  priority: number;
}

/**
 * Verified places within `radiusM` (straight line) of `origin`, most worthwhile first
 * (places_near_point). `categories` null means every category except towns.
 */
export async function placesNearDb(
  origin: LngLat,
  radiusM: number,
  categories: string[] | null,
  lim = 400,
): Promise<PlaceNearRow[]> {
  const rows = await getDb().execute<RawRow>(
    sql`SELECT * FROM places_near_point(${origin[0]}, ${origin[1]}, ${Math.round(radiusM)},
          ${sql.param(categories)}::text[], ${Math.round(lim)})`,
  );
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    category: r.category,
    location: [r.lng, r.lat],
    distanceM: Number(r.distance_m),
    ratingAvg: r.rating_avg,
    ratingCount: r.rating_count,
    bestMonths: r.best_months,
    thumbUrl: r.thumb_url,
    trendingScore: r.trending_score,
    notable: r.notable,
    priority: Number(r.priority),
  }));
}
