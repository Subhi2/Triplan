import { sql } from "drizzle-orm";
import type { LineString } from "geojson";
import type { LngLat } from "@/lib/geo";
import {
  OVERNIGHT_TOWN_M,
  routeTimeline,
  splitDays,
  STAY_RADIUS_M,
  suggestDays,
  minAtKm,
  type DayPlan,
  type DaysRequest,
  type OvernightTown,
  type StayNear,
  type Timeline,
} from "@/lib/multiDay";
import { getDb } from "../db";
import type { RouteResult } from "../providers/routing";
import { townsAlong, type TownAlongRow } from "./corridorService";
import { RESIDENT_HOSTEL_SQL } from "./serviceClassify";
import { getRouteResult } from "./routeService";

/** Towns weighed for the nights, at most: the biggest, so one query stays quick. */
const MAX_CANDIDATES = 150;
/** Stays listed under each night. */
const STAYS_LISTED = 4;

export interface DayPlanDeps {
  routeResult(id: string): Promise<RouteResult | null>;
  townsAlong(geometry: LineString): Promise<TownAlongRow[]>;
  /** Stays within STAY_RADIUS_M of each point, in order. */
  stayCounts(points: LngLat[]): Promise<number[]>;
  /** The nearest stays to each point (our place pages first), in order. */
  staysNear(points: LngLat[]): Promise<StayNear[][]>;
}

export const defaultDayPlanDeps: DayPlanDeps = {
  routeResult: (id) => getRouteResult(id),
  townsAlong: (geometry) => townsAlong(geometry, OVERNIGHT_TOWN_M),
  stayCounts,
  staysNear,
};

/**
 * The route split into days. Null when the route id has expired and no geometry was sent.
 * One day needs no database: the plan is the whole route.
 */
export async function planDays(
  req: DaysRequest,
  deps: DayPlanDeps = defaultDayPlanDeps,
): Promise<DayPlan | null> {
  let geometry: LineString;
  let timeline: Timeline;
  const result = req.routeId ? await deps.routeResult(req.routeId) : null;
  if (result) {
    geometry = result.geometry;
    timeline = routeTimeline(result.roads, result.distanceM / 1000, result.durationS / 60);
  } else if (req.geometry && req.distanceKm && req.durationMin) {
    geometry = req.geometry;
    timeline = routeTimeline(undefined, req.distanceKm, req.durationMin);
  } else {
    return null;
  }

  const totalMin = timeline.min.at(-1)!;
  const suggestedDays = suggestDays(totalMin, req.hoursPerDay);
  const days = req.days ?? suggestedDays;
  const line = geometry.coordinates as LngLat[];
  if (days === 1) {
    return {
      suggestedDays,
      days,
      hoursPerDay: req.hoursPerDay,
      legs: splitDays({ timeline, days, towns: [], line }),
    };
  }

  // Towns far enough from both ends to be a night's stop, biggest first.
  const edgeMin = (totalMin / days) * 0.5;
  const towns = (await deps.townsAlong(geometry))
    .filter((t) => {
      const min = minAtKm(timeline, t.kmFromStart);
      return min >= edgeMin && min <= totalMin - edgeMin;
    })
    .sort((a, b) => (b.population ?? 0) - (a.population ?? 0))
    .slice(0, MAX_CANDIDATES);
  const counts = towns.length > 0 ? await deps.stayCounts(towns.map((t) => t.location)) : [];
  const candidates: OvernightTown[] = towns.map((t, i) => ({ ...t, stays: counts[i] ?? 0 }));

  const legs = splitDays({ timeline, days, towns: candidates, line });
  const nights = legs.slice(0, -1);
  const stays = await deps.staysNear(nights.map((l) => l.end.location));
  nights.forEach((l, i) => {
    l.end.stays = stays[i] ?? [];
    // A stretch of road with no town still has its stays counted.
    if (l.end.kind === "road") l.end.stayCount = l.end.stays.length;
  });
  return { suggestedDays, days, hoursPerDay: req.hoursPerDay, legs };
}

/** Not a student or working people's hostel mapped as a tourist one (isResidentHostel). */
const notResidentHostel = sql`NOT (coalesce(sp.name, '') ~* ${RESIDENT_HOSTEL_SQL.hostel}
  AND sp.name ~* ${RESIDENT_HOSTEL_SQL.resident})`;

const pointsTable = (points: LngLat[]) => sql`
  unnest(${sql.param(points.map((p) => p[0]))}::float8[],
         ${sql.param(points.map((p) => p[1]))}::float8[]) WITH ORDINALITY AS u(lng, lat, i)`;

/** Stays (service points and our stay places) within STAY_RADIUS_M of each point. */
async function stayCounts(points: LngLat[]): Promise<number[]> {
  const rows = await getDb().execute<{ i: number; n: number }>(sql`
    WITH t AS (
      SELECT i, ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography AS g FROM ${pointsTable(points)}
    )
    SELECT t.i::int AS i,
      (SELECT count(*) FROM service_point sp
        WHERE sp.kind = 'stay' AND ST_DWithin(sp.location, t.g, ${STAY_RADIUS_M})
          AND ${notResidentHostel})::int +
      (SELECT count(*) FROM place p JOIN category c ON c.id = p.category_id
        WHERE c.slug = 'stay' AND p.status = 'verified'
          AND ST_DWithin(p.location, t.g, ${STAY_RADIUS_M}))::int AS n
    FROM t ORDER BY t.i`);
  const byIndex = new Map(rows.map((r) => [Number(r.i), Number(r.n)]));
  return points.map((_, i) => byIndex.get(i + 1) ?? 0);
}

interface StayRawRow extends Record<string, unknown> {
  i: number;
  id: string;
  name: string;
  phone: string | null;
  slug: string | null;
  lng: number;
  lat: number;
  dist: number;
}

/** The nearest named stays to each point: our stay places (they have pages) before OSM ones. */
async function staysNear(points: LngLat[]): Promise<StayNear[][]> {
  if (points.length === 0) return [];
  const rows = await getDb().execute<StayRawRow>(sql`
    WITH t AS (
      SELECT i, ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography AS g FROM ${pointsTable(points)}
    )
    SELECT t.i::int AS i, s.id, s.name, s.phone, s.slug, s.lng, s.lat, s.dist
    FROM t CROSS JOIN LATERAL (
      SELECT x.* FROM (
        SELECT p.id::text AS id, p.name, NULL::text AS phone, p.slug,
               ST_X(p.location::geometry) AS lng, ST_Y(p.location::geometry) AS lat,
               ST_Distance(p.location, t.g) AS dist, 0 AS rank
        FROM place p JOIN category c ON c.id = p.category_id
        WHERE c.slug = 'stay' AND p.status = 'verified'
          AND ST_DWithin(p.location, t.g, ${STAY_RADIUS_M})
        UNION ALL
        SELECT sp.osm_id, sp.name, sp.phone, NULL,
               ST_X(sp.location::geometry), ST_Y(sp.location::geometry),
               ST_Distance(sp.location, t.g), 1
        FROM service_point sp
        WHERE sp.kind = 'stay' AND sp.name IS NOT NULL
          AND ST_DWithin(sp.location, t.g, ${STAY_RADIUS_M}) AND ${notResidentHostel}
          AND NOT EXISTS (SELECT 1 FROM place p2 WHERE p2.osm_id = sp.osm_id)
      ) x
      ORDER BY x.rank, x.dist
      LIMIT ${STAYS_LISTED}
    ) s
    ORDER BY t.i, s.rank, s.dist`);
  const out: StayNear[][] = points.map(() => []);
  for (const r of rows) {
    out[Number(r.i) - 1]?.push({
      id: r.id,
      name: r.name,
      phone: r.phone,
      location: [Number(r.lng), Number(r.lat)],
      distanceKm: Math.round(Number(r.dist) / 100) / 10,
      slug: r.slug,
    });
  }
  return out;
}
