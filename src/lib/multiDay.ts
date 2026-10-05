import { z } from "zod";
import { pointAtKm, type LngLat } from "./geo";
import { lineStringSchema, ROUTE_ID_PATTERN } from "./places";
import type { Vehicle } from "./trip";

// Multi-day split (docs/02-architecture.md, "Multi-day split"): a long route cut into days of
// riding time, each night in a town on the road with places to stay.

/** Riding hours in a day, by default: a bike day is shorter (breaks, heat, a sore back). */
export const DEFAULT_RIDE_HOURS: Record<Vehicle, RideHours> = { bike: 6, car: 8 };
export const RIDE_HOURS = [4, 5, 6, 7, 8, 9, 10] as const;
export const MAX_DAYS = 10;
/** A town this far from the road can still be the night's stop. */
export const OVERNIGHT_TOWN_M = 5_000;
/** Stays counted and listed around a night's town. */
export const STAY_RADIUS_M = 5_000;
/** A day may run this much longer than planned before the plan suggests another day. */
const DAY_SLACK = 1.2;
/** The night's town may be this share of a day's riding earlier or later than an even split. */
const WINDOW = 0.25;

export type RideHours = (typeof RIDE_HOURS)[number];

export function isRideHours(n: number): n is RideHours {
  return (RIDE_HOURS as readonly number[]).includes(n);
}

/** Km along the route against riding minutes: knots, both rising from 0 to the route's totals. */
export interface Timeline {
  km: number[];
  min: number[];
}

/**
 * The route's timeline from its road stretches' times, so a day ends further along on an
 * expressway than in a ghat. Without stretch times (routes cached before they were recorded),
 * time runs in proportion to distance.
 */
export function routeTimeline(
  roads: { distanceM: number; durationS?: number }[] | undefined,
  distanceKm: number,
  durationMin: number,
): Timeline {
  const even = { km: [0, distanceKm], min: [0, durationMin] };
  if (!roads?.length || roads.some((r) => r.durationS === undefined)) return even;
  const totalM = roads.reduce((n, r) => n + r.distanceM, 0);
  const totalS = roads.reduce((n, r) => n + r.durationS!, 0);
  if (!(totalM > 0) || !(totalS > 0)) return even;
  const km = [0];
  const min = [0];
  let m = 0;
  let s = 0;
  for (const r of roads) {
    m += r.distanceM;
    s += r.durationS!;
    // Scaled to the route's totals, which the stretches miss by rounding.
    km.push((m / totalM) * distanceKm);
    min.push((s / totalS) * durationMin);
  }
  return { km, min };
}

function interpolate(xs: number[], ys: number[], x: number): number {
  if (x <= xs[0]!) return ys[0]!;
  if (x >= xs.at(-1)!) return ys.at(-1)!;
  let lo = 0;
  let hi = xs.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid]! <= x) lo = mid;
    else hi = mid;
  }
  const span = xs[hi]! - xs[lo]!;
  return span > 0 ? ys[lo]! + ((ys[hi]! - ys[lo]!) * (x - xs[lo]!)) / span : ys[lo]!;
}

export const minAtKm = (t: Timeline, km: number) => interpolate(t.km, t.min, km);
export const kmAtMin = (t: Timeline, min: number) => interpolate(t.min, t.km, min);

/** Days needed at `hoursPerDay` of riding; each day may run a fifth over before adding one. */
export function suggestDays(durationMin: number, hoursPerDay: number): number {
  const days = Math.ceil(durationMin / (hoursPerDay * 60 * DAY_SLACK) - 1e-9);
  return Math.min(MAX_DAYS, Math.max(1, days));
}

/** A town near the road that could be a night's stop, with the stays around it. */
export interface OvernightTown {
  name: string;
  location: LngLat;
  kmFromStart: number;
  population: number | null;
  kind: "city" | "town";
  stays: number;
}

export interface StayNear {
  id: string;
  name: string;
  phone: string | null;
  location: LngLat;
  distanceKm: number;
  /** Our place page, for stays that have one. */
  slug: string | null;
}

export interface DayEnd {
  /** The town, or null for a stretch of road with no town (and for the destination). */
  name: string | null;
  kind: "city" | "town" | "road" | "destination";
  location: LngLat;
  kmFromStart: number;
  /** Stays within STAY_RADIUS_M; the nearest few listed. Empty for the destination. */
  stayCount: number;
  stays: StayNear[];
}

export interface DayLeg {
  day: number;
  fromKm: number;
  toKm: number;
  rideMin: number;
  end: DayEnd;
}

export interface DayPlan {
  /** Days the route needs at this many riding hours a day. */
  suggestedDays: number;
  days: number;
  hoursPerDay: number;
  legs: DayLeg[];
}

/**
 * How good a town is for the night: close to an even split, with places to stay, and big
 * enough for food and fuel in the evening. Higher is better.
 */
export function overnightScore(town: OvernightTown, offMin: number, windowMin: number): number {
  const near = 1 - Math.min(1, Math.abs(offMin) / windowMin) ** 2;
  const size =
    Math.min(1, Math.log10((town.population ?? 2_000) + 1) / 6) + (town.kind === "city" ? 0.25 : 0);
  const beds = town.stays > 0 ? Math.min(1, Math.log10(town.stays + 1) / 1.5) : -0.3;
  return 1.2 * near + 0.6 * size + beds;
}

/**
 * Splits the route into `days` days of even riding time, each ending in the best town in a
 * window around the even split. The next day is evened out over what is left, so a night a
 * little early or late does not make the last day short or long. With no town in the window
 * the day ends on the road at the even split.
 */
export function splitDays({
  timeline,
  days,
  towns,
  line,
}: {
  timeline: Timeline;
  days: number;
  towns: OvernightTown[];
  line: LngLat[];
}): DayLeg[] {
  const totalMin = timeline.min.at(-1)!;
  const totalKm = timeline.km.at(-1)!;
  const timed = towns.map((t) => ({ town: t, min: minAtKm(timeline, t.kmFromStart) }));
  const legs: DayLeg[] = [];
  let startKm = 0;
  let startMin = 0;
  for (let day = 1; day < days; day++) {
    const dayMin = (totalMin - startMin) / (days - day + 1);
    const target = startMin + dayMin;
    const windowMin = dayMin * WINDOW;
    let best: (typeof timed)[number] | null = null;
    let bestScore = -Infinity;
    for (const t of timed) {
      const off = t.min - target;
      if (Math.abs(off) > windowMin || t.town.kmFromStart <= startKm) continue;
      const score = overnightScore(t.town, off, windowMin);
      if (score > bestScore) {
        best = t;
        bestScore = score;
      }
    }
    const endMin = best ? best.min : target;
    const endKm = best ? best.town.kmFromStart : kmAtMin(timeline, target);
    legs.push({
      day,
      fromKm: startKm,
      toKm: endKm,
      rideMin: endMin - startMin,
      end: best
        ? {
            name: best.town.name,
            kind: best.town.kind,
            location: best.town.location,
            kmFromStart: endKm,
            stayCount: best.town.stays,
            stays: [],
          }
        : {
            name: null,
            kind: "road",
            location: pointAtKm(line, endKm) ?? line.at(-1)!,
            kmFromStart: endKm,
            stayCount: 0,
            stays: [],
          },
    });
    startKm = endKm;
    startMin = endMin;
  }
  legs.push({
    day: days,
    fromKm: startKm,
    toKm: totalKm,
    rideMin: totalMin - startMin,
    end: {
      name: null,
      kind: "destination",
      location: line.at(-1)!,
      kmFromStart: totalKm,
      stayCount: 0,
      stays: [],
    },
  });
  return legs;
}

/** The day a km along the route falls in (1-based); a night's town belongs to the day ending there. */
export function dayAtKm(legs: Pick<DayLeg, "toKm">[], km: number): number {
  const i = legs.findIndex((l) => km <= l.toKm);
  return (i < 0 ? legs.length - 1 : i) + 1;
}

/** Body of POST /api/route/days. */
export const daysRequestSchema = z
  .object({
    routeId: z.string().regex(ROUTE_ID_PATTERN).optional(),
    // When the route id has expired: the geometry and the route's totals (time runs evenly).
    geometry: lineStringSchema.optional(),
    distanceKm: z.number().positive().max(20_000).optional(),
    durationMin: z
      .number()
      .positive()
      .max(60 * 24 * 30)
      .optional(),
    hoursPerDay: z
      .number()
      .int()
      .refine(isRideHours, { message: `One of ${RIDE_HOURS.join(", ")}` }),
    days: z.number().int().min(1).max(MAX_DAYS).optional(),
  })
  .refine((b) => b.routeId || (b.geometry && b.distanceKm && b.durationMin), {
    message: "Send routeId, or geometry with distanceKm and durationMin",
  });

export type DaysRequest = z.infer<typeof daysRequestSchema>;
