import type { LineString } from "geojson";
import { ROUTE_ID_PATTERN } from "@/lib/places";
import type { RouteOption, TripRequest } from "@/lib/trip";
import { routeDbCache, type JsonCache } from "../db/cache";
import { getRoutingProvider, type RouteResult, type RoutingProvider } from "../providers/routing";
import { routeCacheKey } from "../providers/routing/cached";
import { placesAlong } from "./corridorService";
import { viaLabels, type TownOnRoute } from "./viaLabel";

const MAX_ROUTES = 3;
const TOWN_RADIUS_M = 2_000;
// Towns this close to either end are the start/destination themselves, not "via" towns.
const END_MARGIN_KM = 3;

export interface RouteServiceDeps {
  routing: RoutingProvider;
  townsAlong(geometry: LineString): Promise<TownOnRoute[]>;
}

export async function townsAlongDb(geometry: LineString): Promise<TownOnRoute[]> {
  const rows = await placesAlong(geometry, TOWN_RADIUS_M, ["town"]);
  return rows.map((r) => ({ name: r.name, location: r.location, kmFromStart: r.kmFromStart }));
}

function defaultDeps(): RouteServiceDeps {
  return { routing: getRoutingProvider(), townsAlong: townsAlongDb };
}

const CACHE_KEY_PREFIX = "route:v1:";

/**
 * A route id is the route_cache hash of the routing request plus the route's index in the
 * response, so the places API can load the geometry instead of the client uploading it.
 */
export function routeIdFor(cacheKey: string, index: number): string {
  return `${cacheKey.slice(CACHE_KEY_PREFIX.length)}-${index}`;
}

/** Geometry for a route id from route_cache, or null if the id is unknown or has expired. */
export async function getRouteGeometry(
  id: string,
  cache: JsonCache = routeDbCache,
): Promise<LineString | null> {
  if (!ROUTE_ID_PATTERN.test(id)) return null;
  const [hash, index] = id.split("-") as [string, string];
  const routes = (await cache.get(`${CACHE_KEY_PREFIX}${hash}`)) as RouteResult[] | undefined;
  return routes?.[Number(index)]?.geometry ?? null;
}

/** Routes for a trip: the path through the user's stops, plus engine alternatives when there are none. */
export async function getRoutes(
  trip: TripRequest,
  deps: RouteServiceDeps = defaultDeps(),
): Promise<RouteOption[]> {
  const waypoints = trip.stops.map((s) => s.location);
  const input = { waypoints, alternatives: waypoints.length === 2, profile: trip.vehicle };
  const cacheKey = routeCacheKey(input);
  const results = (await deps.routing.route(input)).slice(0, MAX_ROUTES);

  const routes = await Promise.all(
    results.map(async (r) => {
      const distanceKm = r.distanceM / 1000;
      const towns = (await deps.townsAlong(r.geometry)).filter(
        (t) => t.kmFromStart > END_MARGIN_KM && t.kmFromStart < distanceKm - END_MARGIN_KM,
      );
      return { result: r, distanceKm, towns };
    }),
  );

  const labels = viaLabels(
    routes.map((r) => ({ distanceKm: r.distanceKm, towns: r.towns })),
    trip.stops.slice(1, -1).map((s) => s.label),
  );

  return routes.map((r, i) => ({
    id: routeIdFor(cacheKey, i),
    geometry: r.result.geometry,
    distanceKm: r.distanceKm,
    durationMin: Math.round(r.result.durationS / 60),
    viaLabel: labels[i]!,
    towns: r.towns.map((t) => t.name),
  }));
}
