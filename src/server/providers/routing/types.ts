import type { LineString } from "geojson";
import type { LngLat } from "@/lib/geo";

export type RoutingProfile = "bike" | "car";

export interface RouteInput {
  waypoints: LngLat[]; // start, ...vias, end
  alternatives: boolean;
  profile: RoutingProfile;
}

/** A stretch of road along a route; `ref` is its road number ("NH75", "SH 57") or null. */
export interface RoadStretch {
  distanceM: number;
  /** Riding time on the stretch; missing on routes cached before it was recorded. */
  durationS?: number;
  ref: string | null;
}

export interface RouteResult {
  geometry: LineString; // full resolution
  distanceM: number;
  durationS: number;
  legs: { distanceM: number; durationS: number; summary: string }[];
  /** Road stretches in route order, when the provider reports them. */
  roads?: RoadStretch[];
}

export interface RoutingProvider {
  route(input: RouteInput): Promise<RouteResult[]>;
}

export class NoRouteError extends Error {
  constructor(message = "No route found between these stops") {
    super(message);
    this.name = "NoRouteError";
  }
}

/** The public OSRM server allows 100 coordinates per table request, the origin included. */
export const MAX_TABLE_DESTINATIONS = 99;

export interface TableInput {
  origin: LngLat;
  destinations: LngLat[];
  profile: RoutingProfile;
}

/** Road distance and time from the origin to one destination. */
export interface TableCell {
  distanceM: number;
  durationS: number;
}

/** Road times from one point to many (one request), for "within 1 h" on the Near me screen. */
export interface RoutingTableProvider {
  /** One cell per destination, in order; null when the road network cannot reach it. */
  table(input: TableInput): Promise<(TableCell | null)[]>;
}
