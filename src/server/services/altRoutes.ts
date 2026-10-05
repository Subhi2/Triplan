import type { LineString } from "geojson";
import { haversineM, resampleLine, type LngLat } from "@/lib/geo";
import { townSize } from "./viaLabel";

export interface CandidateTown {
  name: string;
  location: LngLat;
  population: number | null;
  kind: "city" | "town" | "village";
}

// Extra route options through a town, when the routing engine returns fewer than three routes
// (OSRM's alternatives are limited; Bengaluru → Samse gets two, missing the Hassan–Belur road).
/** Trips shorter than this (straight line) get no extra options. */
const MIN_TRIP_M = 40_000;
/** Towns whose detour (start→town→end over start→end, straight line) is at most this. */
const MAX_STRAIGHT_DETOUR = 1.15;
/** Only towns between the ends, not next to the start or the destination. */
const MIN_POSITION = 0.2;
const MAX_POSITION = 0.85;
/** A town this close to a route found so far would give (nearly) the same route. */
const MIN_OFF_ROUTE_M = 8_000;
/** A new option may share at most this much of its length with an existing one... */
export const MAX_SHARED = 0.8;
/** ...and be at most this much longer / slower than the best one. */
export const MAX_DISTANCE_FACTOR = 1.2;
export const MAX_DURATION_FACTOR = 1.15;

const SAMPLE_M = 500;
const SHARED_WITHIN_M = 1_000;
const CELL_DEG = 0.012; // ~1.2 km grid for nearest-sample lookups

/** Points every 500 m along a route, for comparing routes. */
export function sampleRoute(geometry: LineString): LngLat[] {
  return resampleLine(geometry.coordinates as LngLat[], SAMPLE_M);
}

const cellKey = (lng: number, lat: number) =>
  `${Math.floor(lng / CELL_DEG)},${Math.floor(lat / CELL_DEG)}`;

/** Share (0–1) of route `a` that runs within 1 km of route `b` (both from sampleRoute). */
export function sharedShare(a: LngLat[], b: LngLat[]): number {
  if (a.length === 0) return 0;
  const grid = new Map<string, LngLat[]>();
  for (const p of b) {
    const k = cellKey(p[0], p[1]);
    grid.set(k, [...(grid.get(k) ?? []), p]);
  }
  let shared = 0;
  for (const p of a) {
    const cx = Math.floor(p[0] / CELL_DEG);
    const cy = Math.floor(p[1] / CELL_DEG);
    let near = false;
    for (let dx = -1; dx <= 1 && !near; dx++) {
      for (let dy = -1; dy <= 1 && !near; dy++) {
        near = (grid.get(`${cx + dx},${cy + dy}`) ?? []).some(
          (q) => haversineM(p, q) <= SHARED_WITHIN_M,
        );
      }
    }
    if (near) shared++;
  }
  return shared / a.length;
}

function distanceToRouteM(p: LngLat, samples: LngLat[]): number {
  let min = Infinity;
  for (const q of samples) min = Math.min(min, haversineM(p, q));
  return min;
}

/** Bounding box [west, south, east, north] that holds every town viaTownCandidates may pick. */
export function candidateBox(start: LngLat, end: LngLat): [number, number, number, number] {
  const padDeg = (0.4 * haversineM(start, end)) / 111_000;
  return [
    Math.min(start[0], end[0]) - padDeg,
    Math.min(start[1], end[1]) - padDeg,
    Math.max(start[0], end[0]) + padDeg,
    Math.max(start[1], end[1]) + padDeg,
  ];
}

/**
 * Towns worth routing through for another option: on the way between start and end, well away
 * from every route found so far (`routes`, from sampleRoute). The most on-the-way first, then the
 * largest: a big city far off the line (Mysuru for Bengaluru → Samse) gives a long detour, while a
 * small town on it (Belur) gives a real alternative.
 */
export function viaTownCandidates(
  start: LngLat,
  end: LngLat,
  towns: CandidateTown[],
  routes: LngLat[][],
  max: number,
): CandidateTown[] {
  const direct = haversineM(start, end);
  if (direct < MIN_TRIP_M) return [];
  return (
    towns
      .map((town) => {
        const toTown = haversineM(start, town.location);
        const fromTown = haversineM(town.location, end);
        return {
          town,
          detour: (toTown + fromTown) / direct,
          position: toTown / (toTown + fromTown),
        };
      })
      .filter(
        ({ town, detour, position }) =>
          detour <= MAX_STRAIGHT_DETOUR &&
          position >= MIN_POSITION &&
          position <= MAX_POSITION &&
          routes.every((r) => distanceToRouteM(town.location, r) >= MIN_OFF_ROUTE_M),
      )
      // Detour in 1% steps, so towns about as much on the way are ordered by size.
      .sort(
        (a, b) =>
          Math.round(a.detour * 100) - Math.round(b.detour * 100) ||
          townSize(b.town) - townSize(a.town),
      )
      .slice(0, max)
      .map((c) => c.town)
  );
}
