import type { LineString } from "geojson";
import { z } from "zod";
import { haversineM, metresAlong, type LngLat } from "./geo";

export const MAX_VIA_STOPS = 5;
export const CORRIDOR_KM = [2, 5, 10, 25] as const;
export const DEFAULT_CORRIDOR_KM = 5;
export const VEHICLES = ["bike", "car"] as const;

export type Vehicle = (typeof VEHICLES)[number];
export type CorridorKm = (typeof CORRIDOR_KM)[number];

export const lngLatSchema = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);

export const stopSchema = z.object({
  label: z.string().trim().min(1).max(200),
  location: lngLatSchema,
});

/** Body of POST /api/route: start, 0–5 via stops, destination. */
export const tripRequestSchema = z.object({
  stops: z
    .array(stopSchema)
    .min(2)
    .max(MAX_VIA_STOPS + 2),
  vehicle: z.enum(VEHICLES).default("bike"),
});

export type Stop = z.infer<typeof stopSchema>;
export type TripRequest = z.infer<typeof tripRequestSchema>;

/**
 * How a route's distance splits by kind of road, in metres. The parts do not overlap and add up
 * to the route distance: ghat sections count as ghat whatever road they are on.
 */
export interface RoadMix {
  nationalM: number; // national highways and expressways (NH, NE)
  stateM: number; // state highways (SH)
  ghatM: number; // winding hill (ghat) sections, detected from the road's shape
  otherM: number; // district and local roads
}

export interface RouteOption {
  id: string; // route_cache hash of the routing request, plus the route's index in it
  geometry: LineString;
  distanceKm: number;
  durationMin: number;
  viaLabel: string; // "via Sakleshpur"
  towns: string[];
  roadMix: RoadMix | null; // null when the routing engine does not report road numbers
}

export interface GeocodeResult {
  id: string;
  name: string;
  label: string;
  location: [number, number];
  source: "local" | "photon" | "osm"; // our places, Photon suggestions, Nominatim (Enter)
}

/** A stop this close to a place is that place: "Add to trip" shows it as already added. */
export const SAME_STOP_M = 150;

/** Index of the stop at `location` (within SAME_STOP_M), or -1. Unresolved stops are skipped. */
export function stopIndexAt(stops: (LngLat | null)[], location: LngLat): number {
  return stops.findIndex((s) => s !== null && haversineM(s, location) <= SAME_STOP_M);
}

/**
 * Where a new via stop goes in a trip's stops (start, vias, destination) so the route still
 * visits them in order along `route`: before the first via stop further along than the new one,
 * otherwise just before the destination. Unresolved (empty) via stops keep their place.
 */
export function viaInsertIndex(
  stops: (LngLat | null)[],
  route: LngLat[],
  location: LngLat,
): number {
  const at = metresAlong(route, location);
  for (let i = 1; i < stops.length - 1; i++) {
    const s = stops[i];
    if (s && metresAlong(route, s) > at) return i;
  }
  return Math.max(1, stops.length - 1);
}
