import { haversineM, resampleLine, type LngLat } from "./geo";

// Which famous ride an opened GPX ride follows (G7 bucket list, from G5 "Ride your GPX"). Worked
// out in the browser against the ride lines the planner already has, so nothing more about the
// rider's ride leaves the phone.

/** How near the ride's line must run to the rider's track. Ride lines are simplified by about
 *  1.1 km (rideService), and the track is sampled every 500 m. */
export const MATCH_WITHIN_M = 2_000;
/** The share of the famous ride that must lie along the track to count it as ridden. */
export const MATCH_COVERAGE = 0.85;

const TRACK_STEP_M = 500;
const RIDE_STEP_M = 1_000;
/** Grid cells of the track index, in degrees: a cell is at least MATCH_WITHIN_M across in India
 *  (0.025° of longitude is 2.2 km at 37°N), so a point's own and neighbouring cells hold every
 *  track point within reach. */
const CELL_DEG = 0.025;

export interface RideLine {
  slug: string;
  line: LngLat[];
}

export interface RideMatch {
  slug: string;
  /** The share of the ride's line along the track, 0–1. */
  coverage: number;
}

const cell = (lng: number, lat: number) =>
  `${Math.floor(lng / CELL_DEG)}:${Math.floor(lat / CELL_DEG)}`;

/**
 * The famous ride best covered by `track`, when at least MATCH_COVERAGE of it lies within
 * MATCH_WITHIN_M of the track; null otherwise. Riding it either way round counts, and so does a
 * longer ride that takes it in.
 */
export function matchFamousRide(track: LngLat[], rides: readonly RideLine[]): RideMatch | null {
  if (track.length < 2) return null;
  const points = resampleLine(track, TRACK_STEP_M);
  const grid = new Map<string, LngLat[]>();
  let [west, south, east, north] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of points) {
    const key = cell(p[0], p[1]);
    (grid.get(key) ?? grid.set(key, []).get(key)!).push(p);
    west = Math.min(west, p[0]);
    east = Math.max(east, p[0]);
    south = Math.min(south, p[1]);
    north = Math.max(north, p[1]);
  }
  const pad = CELL_DEG;
  const nearTrack = (p: LngLat) => {
    const cx = Math.floor(p[0] / CELL_DEG);
    const cy = Math.floor(p[1] / CELL_DEG);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (const q of grid.get(`${cx + dx}:${cy + dy}`) ?? [])
          if (haversineM(p, q) <= MATCH_WITHIN_M) return true;
    return false;
  };

  let best: RideMatch | null = null;
  for (const ride of rides) {
    if (ride.line.length < 2) continue;
    // Most rides are nowhere near: skip any whose box misses the track's.
    const outside = ride.line.every(
      ([lng, lat]) =>
        lng < west - pad || lng > east + pad || lat < south - pad || lat > north + pad,
    );
    if (outside) continue;
    const samples = resampleLine(ride.line, RIDE_STEP_M);
    let along = 0;
    for (const p of samples) if (nearTrack(p)) along++;
    const coverage = along / samples.length;
    if (coverage >= MATCH_COVERAGE && (!best || coverage > best.coverage))
      best = { slug: ride.slug, coverage };
  }
  return best;
}
