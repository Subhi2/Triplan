import { z } from "zod";
import { CATEGORIES, isCategorySlug } from "./categories";
import { isInSeason } from "./months";
import { round3, roundLngLat3, type LngLat } from "./geo";
import { DEFAULT_CORRIDOR_KM, VEHICLES, type Vehicle } from "./trip";
import { decodeStop, serializeTripUrl, type UrlStop } from "./tripUrl";

/**
 * The Near me screen: well-known places the rider can reach from one point within a time budget,
 * measured on the road (OSRM /table), not as the crow flies. See "Nearby search" in
 * docs/02-architecture.md.
 */

export const REACH_MINUTES = [30, 60, 120, 240] as const;
export type ReachMinutes = (typeof REACH_MINUTES)[number];
export const DEFAULT_REACH: ReachMinutes = 60;
export const REACH_LABELS: Record<ReachMinutes, string> = {
  30: "30 min",
  60: "1 h",
  120: "2 h",
  240: "Half day",
};

export function isReachMinutes(n: number): n is ReachMinutes {
  return (REACH_MINUTES as readonly number[]).includes(n);
}

/** A place around the origin (GET /api/places/near). */
export interface PlaceNear {
  id: string;
  slug: string;
  name: string;
  category: string;
  location: LngLat;
  /** Straight line from the origin. */
  distanceKm: number;
  /** By road (OSRM), or null when road times are unavailable (roadTimes "straight"). */
  roadKm: number | null;
  rideMin: number | null;
  /** From the origin, clockwise from north, 0–360. */
  bearingDeg: number;
  rating: number | null;
  ratingCount: number;
  bestMonths: number[];
  /** The months are estimated from the category and climate (src/lib/guideDefaults.ts). */
  bestMonthsEstimated: boolean;
  thumbUrl: string | null;
  trending: boolean;
  notable: boolean;
  /** How well-known the place is: category weight, curated, Wikidata, rating, trending. */
  fame: number;
}

export interface NearbyResponse {
  places: PlaceNear[];
  /** "osrm": reachable within the time on the road. "straight": OSRM failed; straight-line cut. */
  roadTimes: "osrm" | "straight";
  radiusKm: number;
}

export const NEARBY_MODES = ["reach", "ride"] as const;
export type NearbyMode = (typeof NEARBY_MODES)[number];

/** Query of GET /api/places/near. The position is rounded to ~100 m before anything uses it. */
export const nearbyQuerySchema = z.object({
  lng: z.coerce.number().min(-180).max(180).transform(round3),
  lat: z.coerce.number().min(-90).max(90).transform(round3),
  within: z.coerce
    .number()
    .refine(isReachMinutes, { message: `One of ${REACH_MINUTES.join(", ")}` })
    .transform((n) => n as ReachMinutes)
    .default(DEFAULT_REACH),
  vehicle: z.enum(VEHICLES).default("bike"),
  categories: z
    .string()
    .transform((s) => [...new Set(s.split(",").filter(Boolean))])
    .pipe(
      z
        .array(z.string().regex(/^[a-z0-9_]+$/))
        .min(1)
        .max(20),
    )
    .optional(),
  mode: z.enum(NEARBY_MODES).default("reach"),
});

export type NearbyQuery = z.infer<typeof nearbyQuerySchema>;

/**
 * Straight-line radius that holds every place reachable within the time: 60 km/h as the crow
 * flies is faster than any Indian road allows, so nothing reachable is missed. Bikes are 10 %
 * slower (as routing). Capped so a half-day search stays one database query.
 */
export const CANDIDATE_SPEED_KMH = 60;
export const MAX_REACH_RADIUS_KM = 250;
/** Without road times, places within this straight-line pace are shown instead (a guess). */
export const STRAIGHT_SPEED_KMH = 35;
const BIKE_SLOWER = 1.1;

export function reachRadiusM(withinMin: ReachMinutes, vehicle: Vehicle): number {
  const km = ((withinMin / 60) * CANDIDATE_SPEED_KMH) / (vehicle === "bike" ? BIKE_SLOWER : 1);
  return Math.round(Math.min(km, MAX_REACH_RADIUS_KM) * 1000);
}

export function straightReachKm(withinMin: ReachMinutes, vehicle: Vehicle): number {
  return ((withinMin / 60) * STRAIGHT_SPEED_KMH) / (vehicle === "bike" ? BIKE_SLOWER : 1);
}

/** Ride mode ("Ahead of you") looks this far around the rider, straight line. */
export const RIDE_RADIUS_M = 35_000;

/** How well-known a place is, from what we hold (no Google data: it may not be stored). */
export function fameScore(p: {
  priority: number;
  rating: number | null;
  trending: boolean;
}): number {
  return p.priority + (p.rating ?? 0) / 5 + (p.trending ? 0.3 : 0);
}

/** A place at its best this month ranks a little higher ("In season"). */
export const IN_SEASON_BOOST = 0.3;

/** Ranking for the Near me list and the places sent for road times. `month` is 1–12. */
export function nearbyRank(p: Pick<PlaceNear, "fame" | "bestMonths">, month: number): number {
  return p.fame + (isInSeason(p.bestMonths, month) ? IN_SEASON_BOOST : 0);
}

/**
 * Up to `max` candidates for road times (one OSRM /table request), spread over distance: the
 * radius is cut into rings and each ring keeps its best places, so a half-day search does not
 * spend every slot on famous places at the edge, then the remaining slots go to the best left.
 */
export function pickCandidates<T extends { distanceKm: number }>(
  places: T[],
  radiusKm: number,
  rank: (p: T) => number,
  max: number,
  rings = 4,
): T[] {
  const byRank = [...places].sort((a, b) => rank(b) - rank(a) || a.distanceKm - b.distanceKm);
  const quota = Math.floor(max / rings);
  const perRing = new Array<number>(rings).fill(0);
  const picked = new Set<T>();
  for (const p of byRank) {
    const ring = Math.min(rings - 1, Math.floor((p.distanceKm / radiusKm) * rings));
    if (perRing[ring]! < quota) {
      perRing[ring]!++;
      picked.add(p);
    }
  }
  for (const p of byRank) {
    if (picked.size >= max) break;
    picked.add(p);
  }
  return byRank.filter((p) => picked.has(p)).slice(0, max);
}

/** The default Near me list: this many of the best places, nearest first. */
export const NEARBY_TOP = 20;

/**
 * The best `NEARBY_TOP` places by rank, shown nearest first (by ride time, or by distance when
 * road times are unavailable). Picking a category shows every place in it instead.
 */
export function topNearby<T extends Pick<PlaceNear, "fame" | "rideMin" | "distanceKm">>(
  places: T[],
  rank: (p: T) => number = (p) => p.fame,
): T[] {
  return [...places]
    .sort((a, b) => rank(b) - rank(a) || a.distanceKm - b.distanceKm)
    .slice(0, NEARBY_TOP)
    .sort((a, b) => (a.rideMin ?? a.distanceKm) - (b.rideMin ?? b.distanceKm));
}

/** The ride time column of a row: "35" MIN, "1:05" HRS. */
export function formatRideShort(minutes: number): { value: string; unit: "MIN" | "HRS" } {
  const total = Math.max(1, Math.round(minutes));
  if (total < 60) return { value: String(total), unit: "MIN" };
  const h = Math.floor(total / 60);
  return { value: `${h}:${String(total % 60).padStart(2, "0")}`, unit: "HRS" };
}

/** The point the Near me screen searches around. */
export interface NearbyOrigin {
  /** A typed place's name; null for a position (the rider's own, or a point on the map). */
  label: string | null;
  location: LngLat;
}

export interface NearbyUrlState {
  at: NearbyOrigin | null;
  within: ReachMinutes;
  vehicle: Vehicle;
  categories: string[];
}

// /nearby?at=75.785,12.943&within=60&v=bike   (a position)
// /nearby?at=Sakleshpur@75.785,12.943         (a typed place)
// plus optional cat=temple,fort. Positions are kept to 3 decimals (~100 m) for privacy.
export function parseNearbyUrl(params: URLSearchParams): NearbyUrlState {
  const within = Number(params.get("within"));
  const vehicle = params.get("v");
  return {
    at: decodeOrigin(params.get("at")),
    within: isReachMinutes(within) ? within : DEFAULT_REACH,
    vehicle: VEHICLES.includes(vehicle as Vehicle) ? (vehicle as Vehicle) : "bike",
    categories: [
      ...new Set(
        (params.get("cat") ?? "")
          .split(",")
          .map((c) => c.trim())
          .filter((c) => isCategorySlug(c) && CATEGORIES[c].weight > 0),
      ),
    ],
  };
}

function decodeOrigin(value: string | null): NearbyOrigin | null {
  if (!value) return null;
  const stop = value.includes("@") ? decodeStop(value) : decodeStop(`x@${value}`);
  if (!stop) return null;
  const location: LngLat = [round3(stop.location[0]), round3(stop.location[1])];
  return { label: value.includes("@") ? stop.label : null, location };
}

export function serializeNearbyUrl(state: NearbyUrlState): string {
  const params = new URLSearchParams();
  if (state.at) {
    const [lng, lat] = state.at.location;
    const point = `${round3(lng)},${round3(lat)}`;
    params.set("at", state.at.label ? `${state.at.label}@${point}` : point);
  }
  params.set("within", String(state.within));
  params.set("v", state.vehicle);
  if (state.categories.length > 0) params.set("cat", state.categories.join(","));
  return params.toString();
}

/** A trip stop at the rider's own position (kept to ~100 m), from "Use my location". */
export const MY_LOCATION = "My location";

/**
 * "Ride there": the planner from the point searched around to a place, so the places along that
 * road take over. The start is kept to 3 decimals: planner links and saved trips are shareable.
 */
export function rideThereHref(
  from: UrlStop,
  to: { name: string; location: LngLat },
  vehicle: Vehicle,
): string {
  return `/?${serializeTripUrl({
    from: { label: from.label, location: roundLngLat3(from.location) },
    via: [],
    to: { label: to.name, location: to.location },
    vehicle,
    corridorKm: DEFAULT_CORRIDOR_KM,
    categories: [],
    maxDetourKm: null,
    rideHours: null,
    days: null,
  })}`;
}
