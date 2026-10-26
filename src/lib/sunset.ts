import SunCalc from "suncalc";
import { placeRank, type PlaceAlong } from "./places";
import { arrivalAt, type RideTiming } from "./roadRules";

// Sunset stop (docs/02, "Breaks, sunset stop, tolls and helplines"): end each day at a viewpoint,
// peak, beach or lake, with the time to leave to get there before the sun goes down. The
// peak-end rule says a ride is remembered by its best moment and its end. Pure.

export const SUNSET_CATEGORIES = ["viewpoint", "peak", "beach", "lake"] as const;
/** Get there this long before sunset, to park and walk up. */
export const SUNSET_EARLY_MIN = 30;
/** The stop is in the last quarter of the day's riding. */
export const SUNSET_LAST_SHARE = 0.25;
/** At most this far off the road (straight line, one way). */
export const SUNSET_MAX_DETOUR_KM = 5;
/** Detours are ridden at this speed. */
const DETOUR_KMH = 40;
const DAY_MS = 24 * 60 * 60_000;

export interface SunsetStop {
  place: PlaceAlong;
  /** 0 for the first day. */
  day: number;
  /** When the rider gets there leaving at the planned time. */
  arriveAt: Date;
  sunset: Date;
  /** The start time (that day) that gets there SUNSET_EARLY_MIN before sunset. */
  leaveBy: Date;
}

/** Noon of the same calendar day in the runtime's time zone, so SunCalc picks the right day. */
function noonOf(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12);
}

/**
 * For each day (or the whole ride), the best viewpoint, peak, beach or lake in its last quarter
 * and within 5 km of the road, with its sunset and the time to leave to be there 30 minutes
 * before it. Days without one are left out.
 */
export function planSunsetStops(places: PlaceAlong[], timing: RideTiming): SunsetStop[] {
  const endKm = timing.timeline.km.at(-1) ?? 0;
  const days = timing.days && timing.days.length > 0 ? timing.days : [{ fromKm: 0, toKm: endKm }];
  const stops: SunsetStop[] = [];
  days.forEach((d, day) => {
    const fromKm = d.toKm - (d.toKm - d.fromKm) * SUNSET_LAST_SHARE;
    const best = places
      .filter(
        (p) =>
          (SUNSET_CATEGORIES as readonly string[]).includes(p.category) &&
          p.detourKm <= SUNSET_MAX_DETOUR_KM &&
          p.kmFromStart >= fromKm &&
          p.kmFromStart <= d.toKm,
      )
      .sort((a, b) => placeRank(b) - placeRank(a) || a.detourKm - b.detourKm)[0];
    if (!best) return;
    const detourMs = (best.detourKm / DETOUR_KMH) * 60 * 60_000;
    const arriveAt = new Date(arrivalAt(best.kmFromStart, timing).getTime() + detourMs);
    const [lng, lat] = best.location;
    const sunset = SunCalc.getTimes(noonOf(arriveAt), lat, lng).sunset;
    const dayStart = timing.departAt.getTime() + day * DAY_MS;
    const shift = sunset.getTime() - SUNSET_EARLY_MIN * 60_000 - arriveAt.getTime();
    stops.push({ place: best, day, arriveAt, sunset, leaveBy: new Date(dayStart + shift) });
  });
  return stops;
}
