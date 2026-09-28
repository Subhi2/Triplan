import { createHash } from "node:crypto";
import type { LineString } from "geojson";
import type { RouteOption, TripRequest } from "@/lib/trip";
import { getRoutingProvider, type RoutingProvider } from "../providers/routing";
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

export function routeId(geometry: LineString): string {
  return createHash("sha1").update(JSON.stringify(geometry.coordinates)).digest("hex").slice(0, 12);
}

/** Routes for a trip: the path through the user's stops, plus engine alternatives when there are none. */
export async function getRoutes(
  trip: TripRequest,
  deps: RouteServiceDeps = defaultDeps(),
): Promise<RouteOption[]> {
  const waypoints = trip.stops.map((s) => s.location);
  const results = (
    await deps.routing.route({
      waypoints,
      alternatives: waypoints.length === 2,
      profile: trip.vehicle,
    })
  ).slice(0, MAX_ROUTES);

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
    id: routeId(r.result.geometry),
    geometry: r.result.geometry,
    distanceKm: r.distanceKm,
    durationMin: Math.round(r.result.durationS / 60),
    viaLabel: labels[i]!,
    towns: r.towns.map((t) => t.name),
  }));
}
