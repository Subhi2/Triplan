import { sql } from "drizzle-orm";
import { PLACE_LIST_CATEGORIES } from "@/lib/categories";
import { bearingDeg, type LngLat } from "@/lib/geo";
import {
  fameScore,
  nearbyRank,
  pickCandidates,
  reachRadiusM,
  RIDE_RADIUS_M,
  straightReachKm,
  type NearbyQuery,
  type NearbyResponse,
  type PlaceNear,
} from "@/lib/nearby";
import { TRENDING_MIN_SCORE } from "@/lib/places";
import { getDb } from "../db";
import {
  getRoutingTableProvider,
  MAX_TABLE_DESTINATIONS,
  type RoutingTableProvider,
} from "../providers/routing";

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

/** Places the database returns for one search; the best of them get road times. */
const DB_LIMIT = 400;
/** Ride mode filters on the phone as the rider moves; this many is plenty for 35 km around. */
const RIDE_LIMIT = 150;

export interface NearbyDeps {
  placesNear: typeof placesNearDb;
  table: RoutingTableProvider;
}

function defaultDeps(): NearbyDeps {
  return { placesNear: placesNearDb, table: getRoutingTableProvider() };
}

function toPlaceNear(origin: LngLat, row: PlaceNearRow): PlaceNear {
  const trending = row.trendingScore >= TRENDING_MIN_SCORE;
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.category,
    location: row.location,
    distanceKm: row.distanceM / 1000,
    roadKm: null,
    rideMin: null,
    bearingDeg: (bearingDeg(origin, row.location) + 360) % 360,
    rating: row.ratingAvg,
    ratingCount: row.ratingCount,
    bestMonths: row.bestMonths,
    thumbUrl: row.thumbUrl,
    trending,
    notable: row.notable,
    fame: fameScore({ priority: row.priority, rating: row.ratingAvg, trending }),
  };
}

/**
 * Well-known places around a point. "reach": the ones within `within` minutes by road, from one
 * OSRM table request for the best candidates, nearest first; if OSRM fails, a straight-line guess
 * ("straight"). "ride": everything worthwhile within 35 km, straight line only, for the phone to
 * filter by heading as the rider moves (no OSRM: it would be called every few km).
 */
export async function findNearby(
  q: NearbyQuery,
  deps: NearbyDeps = defaultDeps(),
): Promise<NearbyResponse> {
  const origin: LngLat = [q.lng, q.lat];
  const categories = q.categories ?? PLACE_LIST_CATEGORIES;

  if (q.mode === "ride") {
    const rows = await deps.placesNear(origin, RIDE_RADIUS_M, categories, DB_LIMIT);
    return {
      places: rows.slice(0, RIDE_LIMIT).map((r) => toPlaceNear(origin, r)),
      roadTimes: "straight",
      radiusKm: RIDE_RADIUS_M / 1000,
    };
  }

  const radiusM = reachRadiusM(q.within, q.vehicle);
  const rows = await deps.placesNear(origin, radiusM, categories, DB_LIMIT);
  const all = rows.map((r) => toPlaceNear(origin, r));
  const candidates = pickCandidates(all, radiusM / 1000, nearbyRank, MAX_TABLE_DESTINATIONS);

  try {
    const cells = await deps.table.table({
      origin,
      destinations: candidates.map((p) => p.location),
      profile: q.vehicle,
    });
    const places = candidates.flatMap((p, i) => {
      const cell = cells[i];
      if (!cell || cell.durationS > q.within * 60) return [];
      return [{ ...p, roadKm: cell.distanceM / 1000, rideMin: cell.durationS / 60 }];
    });
    places.sort((a, b) => a.rideMin - b.rideMin);
    return { places, roadTimes: "osrm", radiusKm: radiusM / 1000 };
  } catch (err) {
    // The message only: the request (and so the position) stays out of the logs.
    console.warn("Nearby road times unavailable:", err instanceof Error ? err.message : "error");
    const cutKm = straightReachKm(q.within, q.vehicle);
    const within = all.filter((p) => p.distanceKm <= cutKm);
    const places = pickCandidates(within, cutKm, nearbyRank, MAX_TABLE_DESTINATIONS).sort(
      (a, b) => a.distanceKm - b.distanceKm,
    );
    return { places, roadTimes: "straight", radiusKm: cutKm };
  }
}
