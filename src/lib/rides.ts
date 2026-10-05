import { z } from "zod";
import type { RouteCurvature } from "./curvature";
import type { ElevationProfile } from "./elevation";
import type { LngLat } from "./geo";
import type { RoadMix } from "./trip";
import { lngLatSchema, VEHICLES, type Vehicle } from "./trip";
import { serializeTripUrl, type UrlStop } from "./tripUrl";

// Famous rides (docs/02-architecture.md, "Famous rides"): a hand-picked list kept as data in
// data/rides.json, routed once by `pnpm db:seed-rides` into the ride table. Never hard-coded in
// app logic: pages and the planner read whatever rides the table holds.

const stopSchema = z.object({ label: z.string().min(1).max(80), location: lngLatSchema });

export const rideSourceSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  title: z.string().min(5).max(80),
  blurb: z.string().min(40).max(400),
  region: z.string().min(2).max(60),
  vehicle: z.enum(VEHICLES),
  tags: z.array(z.string().min(2).max(30)).max(4),
  bestMonths: z.array(z.number().int().min(1).max(12)).min(1).max(12),
  notes: z.string().max(400).nullable().default(null),
  stops: z.array(stopSchema).min(2).max(7),
  /** Points the route must pass within CHECKPOINT_M, so a wrong road is never stored. */
  checkpoints: z.array(stopSchema).default([]),
  expect: z.object({ km: z.number().positive(), hairpinsMin: z.number().int().min(0).optional() }),
});

export const ridesFileSchema = z.array(rideSourceSchema).min(1);

export type RideSource = z.infer<typeof rideSourceSchema>;

/** The route must pass this close to every checkpoint (bypasses miss town centres by 1–2 km). */
export const CHECKPOINT_M = 3_000;
/** The routed distance may differ from the expected one by this share. */
export const KM_TOLERANCE = 0.15;

/** A famous ride as stored (ride table) and shown on its page. */
export interface Ride {
  slug: string;
  title: string;
  blurb: string;
  region: string;
  vehicle: Vehicle;
  tags: string[];
  bestMonths: number[];
  notes: string | null;
  stops: UrlStop[];
  distanceKm: number;
  durationMin: number;
  ascentM: number | null;
  hairpins: number;
  roadMix: RoadMix | null;
  curvature: RouteCurvature | null;
  profile: ElevationProfile | null;
}

/** A ride in a list: the numbers and a small line to sketch. */
export interface RideSummary {
  slug: string;
  title: string;
  region: string;
  vehicle: Vehicle;
  tags: string[];
  stops: UrlStop[];
  distanceKm: number;
  durationMin: number;
  ascentM: number | null;
  hairpins: number;
  line: LngLat[];
}

/** The planner link that opens a ride with the same stops. */
export function ridePlannerUrl(ride: Pick<Ride, "stops" | "vehicle">): string {
  const [from, ...rest] = ride.stops;
  const to = rest.pop();
  return `/?${serializeTripUrl({
    from: from ?? null,
    via: rest,
    to: to ?? null,
    vehicle: ride.vehicle,
    corridorKm: 5,
    categories: [],
    maxDetourKm: null,
    rideHours: null,
    days: null,
  })}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Sep–Feb" for a run of months (wrapping the year), or "Mar–May, Oct–Nov" for several runs. */
export function monthRange(months: number[]): string {
  const set = new Set(months);
  if (set.size === 12) return "All year";
  if (set.size === 0) return "";
  // Start each run at a month whose previous month is not in the set.
  const runs: [number, number][] = [];
  for (let m = 1; m <= 12; m++) {
    if (!set.has(m) || set.has(m === 1 ? 12 : m - 1)) continue;
    let end = m;
    while (set.has(end === 12 ? 1 : end + 1)) end = end === 12 ? 1 : end + 1;
    runs.push([m, end]);
  }
  return runs
    .map(([a, b]) => (a === b ? MONTHS[a - 1] : `${MONTHS[a - 1]}–${MONTHS[b - 1]}`))
    .join(", ");
}
