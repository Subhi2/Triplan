import type { LineString } from "geojson";
import { routeCurvature } from "@/lib/curvature";
import { simplifyLine, type LngLat } from "@/lib/geo";
import { ROUTE_ID_PATTERN } from "@/lib/places";
import type { RouteOption, TripRequest } from "@/lib/trip";
import { routeDbCache, type JsonCache } from "../db/cache";
import {
  getRoutingProvider,
  type RouteInput,
  type RouteResult,
  type RoutingProvider,
} from "../providers/routing";
import { routeCacheKey } from "../providers/routing/cached";
import {
  candidateBox,
  MAX_DISTANCE_FACTOR,
  MAX_DURATION_FACTOR,
  MAX_SHARED,
  sampleRoute,
  sharedShare,
  viaTownCandidates,
  type CandidateTown,
} from "./altRoutes";
import { townsAlong, townsInBox } from "./corridorService";
import { roadMix } from "./roadMix";
import { mainTowns, viaLabels, type TownOnRoute } from "./viaLabel";

const MAX_ROUTES = 3;
/** Tolerance of the route line sent to the browser. */
const BROWSER_LINE_M = 10;
/** Towns tried as a via point for extra options, per search (one routing request each). */
const MAX_TOWN_TRIES = 3;
const TOWN_RADIUS_M = 2_000;
// Towns this close to either end are the start/destination themselves, not "via" towns.
const END_MARGIN_KM = 3;

export interface RouteServiceDeps {
  routing: RoutingProvider;
  townsAlong(geometry: LineString): Promise<TownOnRoute[]>;
  townsInBox(box: [number, number, number, number]): Promise<CandidateTown[]>;
}

export async function townsAlongDb(geometry: LineString): Promise<TownOnRoute[]> {
  return townsAlong(geometry, TOWN_RADIUS_M);
}

function defaultDeps(): RouteServiceDeps {
  return { routing: getRoutingProvider(), townsAlong: townsAlongDb, townsInBox };
}

const CACHE_KEY_PREFIX = "route:v2:";

/**
 * A route id is the route_cache hash of the routing request plus the route's index in the
 * response, so the places API can load the geometry instead of the client uploading it.
 */
export function routeIdFor(cacheKey: string, index: number): string {
  return `${cacheKey.slice(CACHE_KEY_PREFIX.length)}-${index}`;
}

/** The routing result for a route id from route_cache, or null if unknown or expired. */
export async function getRouteResult(
  id: string,
  cache: JsonCache = routeDbCache,
): Promise<RouteResult | null> {
  if (!ROUTE_ID_PATTERN.test(id)) return null;
  const [hash, index] = id.split("-") as [string, string];
  const routes = (await cache.get(`${CACHE_KEY_PREFIX}${hash}`)) as RouteResult[] | undefined;
  return routes?.[Number(index)] ?? null;
}

/** Geometry for a route id from route_cache, or null if the id is unknown or has expired. */
export async function getRouteGeometry(
  id: string,
  cache: JsonCache = routeDbCache,
): Promise<LineString | null> {
  return (await getRouteResult(id, cache))?.geometry ?? null;
}

interface Found {
  id: string;
  result: RouteResult;
}

/**
 * Tops up the engine's options to three by routing through towns off the routes found so far
 * ("via Belur" between the Hassan–Sakleshpur and Chikkamagaluru routes). A new option must not be
 * much longer or slower than the best one, nor mostly the same road as an existing one. Extra
 * options are a bonus: if routing through a town fails, that town is skipped.
 */
async function addTownRoutes(
  found: Found[],
  [start, end]: [LngLat, LngLat],
  profile: RouteInput["profile"],
  deps: RouteServiceDeps,
): Promise<Found[]> {
  const samples = found.map((f) => sampleRoute(f.result.geometry));
  // Without the database there are no towns to route through: the engine's routes stand.
  const towns = await deps.townsInBox(candidateBox(start, end)).catch((err: unknown) => {
    console.warn("Towns for extra routes failed", err);
    return [];
  });
  const candidates = viaTownCandidates(start, end, towns, samples, MAX_TOWN_TRIES);
  const shortestM = Math.min(...found.map((f) => f.result.distanceM));
  const fastestS = Math.min(...found.map((f) => f.result.durationS));

  const all = [...found];
  for (const town of candidates) {
    if (all.length >= MAX_ROUTES) break;
    const input: RouteInput = {
      waypoints: [start, town.location, end],
      alternatives: false,
      profile,
    };
    let route: RouteResult | undefined;
    try {
      [route] = await deps.routing.route(input);
    } catch (err) {
      console.warn(`Extra route via ${town.name} failed`, err);
      continue;
    }
    if (
      !route ||
      route.distanceM > shortestM * MAX_DISTANCE_FACTOR ||
      route.durationS > fastestS * MAX_DURATION_FACTOR
    ) {
      continue;
    }
    const sampled = sampleRoute(route.geometry);
    if (samples.some((s) => sharedShare(sampled, s) > MAX_SHARED)) continue;
    all.push({ id: routeIdFor(routeCacheKey(input), 0), result: route });
    samples.push(sampled);
  }
  return all;
}

/**
 * Routes for a trip: the path through the user's stops; without via stops, the engine's
 * alternatives topped up to three with routes through towns on the way.
 */
export async function getRoutes(
  trip: TripRequest,
  deps: RouteServiceDeps = defaultDeps(),
): Promise<RouteOption[]> {
  const waypoints = trip.stops.map((s) => s.location);
  const input: RouteInput = {
    waypoints,
    alternatives: waypoints.length === 2,
    profile: trip.vehicle,
  };
  const cacheKey = routeCacheKey(input);
  let found: Found[] = (await deps.routing.route(input))
    .slice(0, MAX_ROUTES)
    .map((result, i) => ({ id: routeIdFor(cacheKey, i), result }));
  if (waypoints.length === 2 && found.length < MAX_ROUTES) {
    found = await addTownRoutes(found, [waypoints[0]!, waypoints[1]!], trip.vehicle, deps);
  }

  const routes = await Promise.all(
    found.map(async ({ id, result }) => {
      const distanceKm = result.distanceM / 1000;
      const along = await deps.townsAlong(result.geometry).catch((err: unknown) => {
        console.warn("Towns along the route failed", err);
        return [];
      });
      const towns = along.filter(
        (t) => t.kmFromStart > END_MARGIN_KM && t.kmFromStart < distanceKm - END_MARGIN_KM,
      );
      return { id, result, distanceKm, towns };
    }),
  );

  const labels = viaLabels(
    routes.map((r) => ({ distanceKm: r.distanceKm, towns: r.towns })),
    trip.stops.slice(1, -1).map((s) => s.label),
  );

  return routes.map((r, i) => ({
    id: r.id,
    // The browser gets the line simplified to about 10 m: OSRM's full line has about 13 points a
    // km (a 1,700 km route, 17,000). Hairpins and the road mix are measured on the full line
    // here, and route_cache keeps it for the place, profile and weather lookups by route id.
    geometry: {
      type: "LineString" as const,
      coordinates: simplifyLine(r.result.geometry.coordinates as LngLat[], BROWSER_LINE_M),
    },
    distanceKm: r.distanceKm,
    durationMin: Math.round(r.result.durationS / 60),
    viaLabel: labels[i]!,
    towns: mainTowns(r.towns).map((t) => t.name),
    townStops: mainTowns(r.towns).map((t) => ({ name: t.name, location: t.location })),
    roadMix: roadMix(r.result),
    curvature: routeCurvature(r.result.geometry, waypoints),
  }));
}
