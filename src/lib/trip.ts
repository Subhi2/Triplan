import type { RouteScenic } from "./scenic";
import type { LineString } from "geojson";
import { z } from "zod";
import type { RouteCurvature } from "./curvature";
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
  /** Where the ghat sections are: [from, to] fractions (0–1) of the route, in road order. */
  ghats: [number, number][];
}

export interface RouteOption {
  id: string; // route_cache hash of the routing request, plus the route's index in it
  geometry: LineString;
  distanceKm: number;
  durationMin: number;
  viaLabel: string; // "via Sakleshpur"
  towns: string[];
  /** The same towns with where they are, so one can become a via stop ("Ride through"). */
  townStops?: { name: string; location: LngLat }[];
  roadMix: RoadMix | null; // null when the routing engine does not report road numbers
  curvature: RouteCurvature | null; // hairpins and twistiness, from the road's shape
  /** The scenic score, 0–10 (G5); missing on routes saved before it, null when not counted. */
  scenic?: RouteScenic | null;
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

/** A trip ends where it starts when its ends are within this of each other. */
const LOOP_M = 1_000;

/** The trip ends where it starts (both ends known and within 1 km). */
export function isLoop(stops: { location: LngLat | null }[]): boolean {
  const a = stops[0]?.location;
  const b = stops.at(-1)?.location;
  return stops.length >= 2 && !!a && !!b && haversineM(a, b) <= LOOP_M;
}

/** The ride back (G10): the same stops the other way round. */
export function rideBack<T>(stops: T[]): T[] {
  return [...stops].reverse();
}

/**
 * A loop (G10): the destination becomes the last stop on the way and the trip ends back at the
 * start (`copyStart` makes the new end from the start, with its own id). Null when the trip is a
 * loop already or there is no room for another stop (MAX_VIA_STOPS).
 */
export function makeLoop<T extends { location: LngLat | null }>(
  stops: T[],
  copyStart: (start: T) => T,
): T[] | null {
  const start = stops[0];
  if (!start || stops.length < 2 || isLoop(stops)) return null;
  if (stops.length - 1 > MAX_VIA_STOPS) return null; // the old destination becomes a via stop
  return [...stops, copyStart(start)];
}
