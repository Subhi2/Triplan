import { CATEGORIES, isCategorySlug } from "./categories";
import { placeRank, type PlaceAlong } from "./places";

// Best stops for my time (docs/02, "Best stops for my time"): the most worthwhile places that
// fit the minutes the rider has for stops. Tourist trip design treats this as an orienteering
// problem; on one road, a greedy pick plus one swap pass is close enough. Pure.

/** The choices offered: 30 min, 1 h, 2 h, half a day. */
export const STOP_BUDGETS_MIN = [30, 60, 120, 240] as const;
export type StopBudgetMin = (typeof STOP_BUDGETS_MIN)[number];

/** Detours are ridden there and back at this speed (they are mostly small roads). */
export const DETOUR_KMH = 40;
/** A place in its best months is worth this much more. */
export const IN_SEASON_BOOST = 1.3;
/** At most one stop per this many minutes (always at least one): two good stops, not eight quick ones. */
export const MIN_PER_STOP = 60;
/** The start of the route is skipped (the rider has only just left): 10% of it, up to 25 km. */
export const START_SKIP_SHARE = 0.1;
export const START_SKIP_MAX_KM = 25;
/** A stop on the way is near the road: the widest "Hide detours over" choice. */
export const PICK_MAX_DETOUR_KM = 5;

/** Food, coffee, fuel and stays are breaks and nights, not sights: the break planner has them. */
const NOT_SIGHTS = new Set(["food", "coffee", "fuel", "stay", "town"]);

/** Whether a place can be picked as a sight to stop at. */
export function isSight(category: string): boolean {
  return isCategorySlug(category) && !NOT_SIGHTS.has(category) && CATEGORIES[category].visitMin > 0;
}

/** Minutes a stop takes: the detour there and back, plus the category's typical visit. */
export function stopMinutes(p: Pick<PlaceAlong, "category" | "detourKm">): number {
  const visit = isCategorySlug(p.category) ? CATEGORIES[p.category].visitMin : 30;
  return ((2 * p.detourKm) / DETOUR_KMH) * 60 + visit;
}

/** How worth stopping a place is in `month` (1–12): its rank, more in its best months. */
export function stopWorth(p: PlaceAlong, month: number | null): number {
  const inSeason = month !== null && p.bestMonths.includes(month);
  return placeRank(p) * (inSeason ? IN_SEASON_BOOST : 1);
}

export interface StopPick {
  /** The picked places in km order. */
  places: PlaceAlong[];
  /** Detours and visits together, in minutes. */
  minutes: number;
}

/**
 * The set of sights with the most worth in all whose detours and visits fit in `budgetMin`: one
 * stop per hour at most (at least one), and never more than `maxStops` (Google Maps takes 9
 * stops). The start of the route (10%, up to 25 km) and places more than 5 km off the road are
 * skipped. Solved exactly as a knapsack over whole minutes and the stop count (a few hundred
 * places × 240 min × 4 stops); of equal totals, the one that takes less time wins.
 */
export function pickStops(
  places: PlaceAlong[],
  budgetMin: number,
  { month, maxStops, routeKm }: { month: number | null; maxStops: number; routeKm: number },
): StopPick {
  const budget = Math.floor(budgetMin);
  const skipKm = Math.min(START_SKIP_MAX_KM, routeKm * START_SKIP_SHARE);
  const options = places
    .filter(
      (p) => isSight(p.category) && p.kmFromStart >= skipKm && p.detourKm <= PICK_MAX_DETOUR_KM,
    )
    .map((place) => ({ place, min: Math.ceil(stopMinutes(place)), worth: stopWorth(place, month) }))
    .filter((o) => o.min <= budget);
  const most = Math.min(maxStops, Math.max(1, Math.floor(budget / MIN_PER_STOP)), options.length);
  if (most <= 0) return { places: [], minutes: 0 };

  // best[k][b]: the most worth from k stops in exactly b minutes (-1 = not reachable).
  const width = budget + 1;
  const best = new Float64Array((most + 1) * width).fill(-1);
  best[0] = 0;
  const took = new Uint8Array(options.length * (most + 1) * width);
  options.forEach((o, i) => {
    for (let k = most; k >= 1; k--) {
      for (let b = budget; b >= o.min; b--) {
        const before = best[(k - 1) * width + b - o.min]!;
        if (before < 0) continue;
        if (before + o.worth > best[k * width + b]! + 1e-9) {
          best[k * width + b] = before + o.worth;
          took[(i * (most + 1) + k) * width + b] = 1;
        }
      }
    }
  });

  let end = { k: 0, b: 0, worth: 0 };
  for (let k = 1; k <= most; k++) {
    for (let b = 0; b <= budget; b++) {
      const w = best[k * width + b]!;
      if (w > end.worth + 1e-9 || (Math.abs(w - end.worth) <= 1e-9 && w > 0 && b < end.b)) {
        end = { k, b, worth: w };
      }
    }
  }

  // Walk back through the items to find which ones made the best total.
  const chosen: PlaceAlong[] = [];
  let { k, b } = end;
  for (let i = options.length - 1; i >= 0 && k > 0; i--) {
    if (took[(i * (most + 1) + k) * width + b]) {
      chosen.push(options[i]!.place);
      b -= options[i]!.min;
      k -= 1;
    }
  }
  return {
    places: chosen.sort((x, y) => x.kmFromStart - y.kmFromStart),
    minutes: end.b,
  };
}
