import type { LngLat } from "./geo";
import { minAtKm } from "./multiDay";
import { arrivalAt, type RideTiming } from "./roadRules";

// Break planner (docs/02, "Breaks, sunset stop, tolls and helplines"): a stop near every 2 hours
// of riding. Pure.

/** A break about this often: road-safety advice is every 2 hours or 100 km. */
export const BREAK_EVERY_MIN = 120;
/** A stop counts when it is this close to the mark, in riding minutes. */
export const BREAK_WINDOW_MIN = 20;
/** Food, coffee and fuel this close to the road (straight line, one way). */
export const BREAK_MAX_DETOUR_KM = 1;
export const BREAK_CATEGORIES = ["food", "coffee", "fuel"] as const;

/** The afternoon dip: a stop outside it wins over one inside it, when there is a choice. */
const DIP_FROM_MIN = 14 * 60;
const DIP_TO_MIN = 16 * 60;

export interface BreakCandidate {
  id: string;
  name: string;
  category: string;
  location: LngLat;
  kmFromStart: number;
  detourKm: number;
}

export interface PlannedBreak<T extends BreakCandidate = BreakCandidate> {
  place: T;
  /** The 2-hour mark this stop covers, in riding minutes from the start of the route. */
  markMin: number;
  arriveAt: Date;
}

export interface BreakPlan<T extends BreakCandidate = BreakCandidate> {
  /** Riding-minute marks that want a stop: every 2 hours, and not the end of a day. */
  marks: number[];
  stops: PlannedBreak<T>[];
}

function inAfternoonDip(at: Date): boolean {
  const min = at.getHours() * 60 + at.getMinutes();
  return min >= DIP_FROM_MIN && min < DIP_TO_MIN;
}

/** One stop near each 2-hour mark, the nearest in the window, preferring one outside 2–4 pm. */
export function planBreaks<T extends BreakCandidate>(
  candidates: T[],
  timing: RideTiming,
): BreakPlan<T> {
  const endKm = timing.timeline.km.at(-1) ?? 0;
  const days =
    timing.days && timing.days.length > 0 ? timing.days : [{ fromKm: 0, toKm: endKm }];
  const eligible = candidates.filter(
    (c) =>
      (BREAK_CATEGORIES as readonly string[]).includes(c.category) &&
      c.detourKm <= BREAK_MAX_DETOUR_KM,
  );
  const used = new Set<string>();
  const marks: number[] = [];
  const stops: PlannedBreak<T>[] = [];

  for (const day of days) {
    const startMin = minAtKm(timing.timeline, day.fromKm);
    const endMin = minAtKm(timing.timeline, day.toKm);
    for (let mark = startMin + BREAK_EVERY_MIN; mark < endMin; mark += BREAK_EVERY_MIN) {
      marks.push(mark);
      const near = eligible.filter((c) => {
        if (used.has(c.id)) return false;
        if (c.kmFromStart < day.fromKm || c.kmFromStart > day.toKm) return false;
        return Math.abs(minAtKm(timing.timeline, c.kmFromStart) - mark) <= BREAK_WINDOW_MIN;
      });
      const outside = near.filter((c) => !inAfternoonDip(arrivalAt(c.kmFromStart, timing)));
      const pool = outside.length > 0 ? outside : near;
      pool.sort((a, b) => {
        const da = Math.abs(minAtKm(timing.timeline, a.kmFromStart) - mark);
        const db = Math.abs(minAtKm(timing.timeline, b.kmFromStart) - mark);
        if (da !== db) return da - db;
        if (a.detourKm !== b.detourKm) return a.detourKm - b.detourKm;
        return a.id.localeCompare(b.id);
      });
      const place = pool[0];
      if (!place) continue;
      used.add(place.id);
      stops.push({ place, markMin: mark, arriveAt: arrivalAt(place.kmFromStart, timing) });
    }
  }
  return { marks, stops };
}
