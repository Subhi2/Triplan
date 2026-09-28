import type { LineString } from "geojson";
import type { LngLat } from "@/lib/geo";

export type RoutingProfile = "bike" | "car";

export interface RouteInput {
  waypoints: LngLat[]; // start, ...vias, end
  alternatives: boolean;
  profile: RoutingProfile;
}

export interface RouteResult {
  geometry: LineString; // full resolution
  distanceM: number;
  durationS: number;
  legs: { distanceM: number; durationS: number; summary: string }[];
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
