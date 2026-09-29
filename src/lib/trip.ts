import type { LineString } from "geojson";
import { z } from "zod";

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
