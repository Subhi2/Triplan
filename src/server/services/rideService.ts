import { asc, eq, sql } from "drizzle-orm";
import type { LineString } from "geojson";
import { routeCurvature, type RouteCurvature } from "@/lib/curvature";
import type { ElevationProfile } from "@/lib/elevation";
import { haversineM, resampleLine, type LngLat } from "@/lib/geo";
import {
  CHECKPOINT_M,
  KM_TOLERANCE,
  type Ride,
  type RidePhoto,
  type RideTier,
  type RideSource,
  type RideSummary,
} from "@/lib/rides";
import { START_SKIP_MAX_KM, START_SKIP_SHARE } from "@/lib/places";
import type { RoadMix } from "@/lib/trip";
import { getDb } from "../db";
import { ride } from "../db/schema";
import type { RouteResult, RoutingProvider } from "../providers/routing";
import { roadMix } from "./roadMix";

/** A ride routed and measured, ready to store, with anything that looks wrong. */
export interface BuiltRide {
  source: RideSource;
  route: RouteResult;
  roadMix: RoadMix | null;
  curvature: RouteCurvature;
  profile: ElevationProfile | null;
  problems: string[];
}

export interface BuildRideDeps {
  routing: RoutingProvider;
  profile(geometry: LineString): Promise<ElevationProfile | null>;
}

/** How far `point` is from the line (to the nearest point every 200 m along it). */
export function distanceToLineM(line: LngLat[], point: LngLat): number {
  let best = Infinity;
  for (const p of resampleLine(line, 200)) best = Math.min(best, haversineM(p, point));
  return best;
}

/** What is wrong with a route for a ride: missed checkpoints, a distance far from the expected. */
export function rideProblems(
  source: RideSource,
  route: RouteResult,
  curvature: RouteCurvature,
): string[] {
  const line = route.geometry.coordinates as LngLat[];
  const problems: string[] = [];
  for (const c of source.checkpoints) {
    const d = distanceToLineM(line, c.location);
    if (d > CHECKPOINT_M) problems.push(`misses ${c.label} by ${(d / 1000).toFixed(1)} km`);
  }
  const km = route.distanceM / 1000;
  if (Math.abs(km - source.expect.km) > source.expect.km * KM_TOLERANCE) {
    problems.push(`is ${km.toFixed(0)} km, expected about ${source.expect.km} km`);
  }
  const min = source.expect.hairpinsMin;
  if (min !== undefined && curvature.hairpins < min) {
    problems.push(`has ${curvature.hairpins} hairpins, expected at least ${min}`);
  }
  return problems;
}

/**
 * Routes a ride through its stops (asking for alternatives with two stops, as the planner does,
 * so the planner's cache is warm too) and keeps the first route that passes every checkpoint.
 */
export async function buildRide(source: RideSource, deps: BuildRideDeps): Promise<BuiltRide> {
  const waypoints = source.stops.map((s) => s.location);
  const routes = await deps.routing.route({
    waypoints,
    alternatives: waypoints.length === 2,
    profile: source.vehicle,
  });
  const scored = routes.map((route) => {
    const curvature = routeCurvature(route.geometry, waypoints);
    return { route, curvature, problems: rideProblems(source, route, curvature) };
  });
  const best = scored.find((s) => s.problems.length === 0) ?? scored[0]!;
  return {
    source,
    route: best.route,
    roadMix: roadMix(best.route),
    curvature: best.curvature,
    profile: await deps.profile(best.route.geometry),
    problems: best.problems,
  };
}

/** Stores a ride (insert or replace on slug). `position` orders the gallery. */
export async function upsertRide(built: BuiltRide, position: number): Promise<void> {
  const { source, route } = built;
  const values = {
    slug: source.slug,
    title: source.title,
    blurb: source.blurb,
    region: source.region,
    vehicle: source.vehicle,
    tags: source.tags,
    tier: source.tier,
    bestMonths: source.bestMonths,
    notes: source.notes,
    stops: source.stops,
    routeGeom: route.geometry,
    distanceM: Math.round(route.distanceM),
    durationS: Math.round(route.durationS),
    roadMix: built.roadMix,
    curvature: built.curvature,
    profile: built.profile,
    ascentM: built.profile?.ascentM ?? null,
    hairpins: built.curvature.hairpins,
    position,
  };
  await getDb()
    .insert(ride)
    .values(values)
    .onConflictDoUpdate({ target: ride.slug, set: { ...values, seededAt: sql`now()` } });
}

type RideRow = Omit<Ride, "distanceKm" | "durationMin"> & { distanceM: number; durationS: number };

function toRide(r: RideRow): Ride {
  return {
    slug: r.slug,
    title: r.title,
    blurb: r.blurb,
    region: r.region,
    vehicle: r.vehicle,
    tags: r.tags,
    tier: r.tier === "legend" ? "legend" : "classic",
    bestMonths: r.bestMonths,
    notes: r.notes,
    stops: r.stops,
    distanceKm: r.distanceM / 1000,
    durationMin: Math.round(r.durationS / 60),
    ascentM: r.ascentM,
    hairpins: r.hairpins,
    roadMix: r.roadMix,
    curvature: r.curvature,
    profile: r.profile,
  };
}

/** Every famous ride in gallery order, each with a light line to sketch. */
export async function listRides(): Promise<RideSummary[]> {
  const rows = await getDb()
    .select({
      slug: ride.slug,
      title: ride.title,
      region: ride.region,
      vehicle: ride.vehicle,
      tags: ride.tags,
      tier: ride.tier,
      bestMonths: ride.bestMonths,
      stops: ride.stops,
      distanceM: ride.distanceM,
      durationS: ride.durationS,
      ascentM: ride.ascentM,
      hairpins: ride.hairpins,
      highestM: sql<number | null>`(${ride.profile}->'highest'->>'m')::int`,
      line: sql<string>`ST_AsGeoJSON(ST_Simplify(${ride.routeGeom}::geometry, 0.01), 4)`,
    })
    .from(ride)
    .orderBy(asc(ride.position), asc(ride.title));
  return rows.map((r) => ({
    slug: r.slug,
    title: r.title,
    region: r.region,
    vehicle: r.vehicle === "car" ? "car" : "bike",
    tags: r.tags,
    tier: r.tier === "legend" ? "legend" : "classic",
    bestMonths: r.bestMonths,
    stops: r.stops,
    distanceKm: r.distanceM / 1000,
    durationMin: Math.round(r.durationS / 60),
    ascentM: r.ascentM,
    hairpins: r.hairpins,
    highestM: r.highestM,
    line: (JSON.parse(r.line) as LineString).coordinates as LngLat[],
  }));
}

/** One ride with its route (lightly simplified for the map), or null. */
export async function getRide(slug: string): Promise<{ ride: Ride; geometry: LineString } | null> {
  const [row] = await getDb()
    .select({
      slug: ride.slug,
      title: ride.title,
      blurb: ride.blurb,
      region: ride.region,
      vehicle: ride.vehicle,
      tags: ride.tags,
      tier: ride.tier,
      bestMonths: ride.bestMonths,
      notes: ride.notes,
      stops: ride.stops,
      distanceM: ride.distanceM,
      durationS: ride.durationS,
      ascentM: ride.ascentM,
      hairpins: ride.hairpins,
      roadMix: ride.roadMix,
      curvature: ride.curvature,
      profile: ride.profile,
      line: sql<string>`ST_AsGeoJSON(ST_Simplify(${ride.routeGeom}::geometry, 0.0002), 5)`,
    })
    .from(ride)
    .where(eq(ride.slug, slug));
  if (!row) return null;
  return {
    ride: toRide({
      ...row,
      vehicle: row.vehicle === "car" ? "car" : "bike",
      tier: row.tier === "legend" ? "legend" : "classic",
    }),
    geometry: JSON.parse(row.line) as LineString,
  };
}

/** Slugs for the sitemap and static pages. */
export async function rideSlugs(): Promise<string[]> {
  const rows = await getDb().select({ slug: ride.slug }).from(ride).orderBy(asc(ride.position));
  return rows.map((r) => r.slug);
}

/** How near the road a ride card's photo place must be. */
const RIDE_PHOTO_M = 3_000;

/**
 * One photo per ride, in one query: of the sights within 3 km of the road with a verified photo
 * of our own (Wikimedia Commons or a rider's; never Google), the most worthwhile by category
 * weight, then notable (curated, reviewed or on Wikidata). Food, coffee, fuel and stays
 * (weight under 0.9) are left out, and so is the city the ride starts in.
 */
export async function ridePhotos(): Promise<Record<string, RidePhoto>> {
  const rows = await getDb().execute<{
    slug: string;
    thumb_url: string;
    place_name: string;
    author: string | null;
    license: string;
    source: string;
  }>(sql`
    SELECT r.slug, pick.thumb_url, pick.place_name, pick.author, pick.license, pick.source
    FROM ride r
    CROSS JOIN LATERAL (
      SELECT m.thumb_url, p.name AS place_name, m.author, m.license, m.source
      FROM place p
      JOIN category c ON c.id = p.category_id
      JOIN LATERAL (
        SELECT thumb_url, author, license, source
        FROM media
        WHERE place_id = p.id AND kind = 'image' AND status = 'verified'
          AND thumb_url IS NOT NULL AND source <> 'google'
        ORDER BY created_at
        LIMIT 1
      ) m ON true
      WHERE p.status = 'verified' AND c.weight >= 0.9
        AND ST_DWithin(p.location, r.route_geom, ${RIDE_PHOTO_M})
        -- Not the city the rider leaves: as best stops, 10% of the ride, at most 25 km.
        AND NOT ST_DWithin(
          p.location,
          ST_StartPoint(r.route_geom::geometry)::geography,
          LEAST(${START_SKIP_MAX_KM * 1000}::float8, r.distance_m * ${START_SKIP_SHARE}::float8)
        )
      ORDER BY c.weight
          + CASE WHEN p.source <> 'osm' OR p.wikidata_id IS NOT NULL OR p.rating_count > 0
                 THEN 1 ELSE 0 END
          -- Landscapes photograph well; a park or museum photo is often its signboard.
          + CASE WHEN c.slug IN ('waterfall', 'viewpoint', 'pass', 'peak', 'fort', 'beach', 'lake')
                 THEN 0.5 ELSE 0 END DESC,
        p.rating_count DESC
      LIMIT 1
    ) pick
  `);
  return Object.fromEntries(
    [...rows].map((r) => [
      r.slug,
      {
        thumbUrl: r.thumb_url,
        placeName: r.place_name,
        author: r.author,
        license: r.license,
        source: r.source,
      },
    ]),
  );
}

/** Sets a stored ride's tier without routing it again (a ride the table does not hold is skipped). */
export async function setRideTier(slug: string, tier: RideTier): Promise<void> {
  await getDb().update(ride).set({ tier }).where(eq(ride.slug, slug));
}

/**
 * Every ride's photo gallery, in order along the road: the Commons photos picked by
 * `pnpm db:import-ride-photos`, or, for a ride without any yet, its single best place photo.
 */
export async function rideGalleries(): Promise<Record<string, RidePhoto[]>> {
  const [rows, single] = await Promise.all([
    getDb().execute<{
      ride_slug: string;
      thumb_url: string;
      url: string;
      page_url: string;
      caption: string;
      author: string | null;
      license: string;
    }>(sql`
      SELECT ride_slug, thumb_url, url, page_url, caption, author, license
      FROM ride_photo ORDER BY ride_slug, position`),
    ridePhotos().catch(() => ({}) as Record<string, RidePhoto>),
  ]);
  const out: Record<string, RidePhoto[]> = {};
  for (const r of rows) {
    (out[r.ride_slug] ??= []).push({
      thumbUrl: r.thumb_url,
      url: r.url,
      pageUrl: r.page_url,
      placeName: r.caption,
      author: r.author,
      license: r.license,
      source: "wikimedia",
    });
  }
  for (const [slug, photo] of Object.entries(single)) out[slug] ??= [photo];
  return out;
}

/** One ride's photo gallery in order along the road; empty until its photos have been imported. */
export async function rideGallery(slug: string): Promise<RidePhoto[]> {
  const rows = await getDb().execute<{
    thumb_url: string;
    url: string;
    page_url: string;
    caption: string;
    author: string | null;
    license: string;
  }>(sql`
    SELECT thumb_url, url, page_url, caption, author, license
    FROM ride_photo WHERE ride_slug = ${slug} ORDER BY position`);
  return [...rows].map((r) => ({
    thumbUrl: r.thumb_url,
    url: r.url,
    pageUrl: r.page_url,
    placeName: r.caption,
    author: r.author,
    license: r.license,
    source: "wikimedia",
  }));
}
