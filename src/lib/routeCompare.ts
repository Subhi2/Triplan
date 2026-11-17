/** What tells route options apart, for the route cards. */

interface Comparable {
  id: string;
  durationMin: number;
  distanceKm: number;
  scenic?: { score: number } | null;
}

export interface RouteDiff {
  /** Minutes slower than the fastest option (0 for the fastest itself). */
  slowerMin: number;
  /** km longer (+) or shorter (−) than the fastest option. */
  longerKm: number;
}

/** Differences under this are not worth showing. */
const SAME_MIN = 1;
const SAME_KM = 0.5;

/** Each option against the fastest, by id; empty with a single option. */
export function routeDiffs(routes: Comparable[]): Record<string, RouteDiff> {
  if (routes.length < 2) return {};
  const fastest = routes.reduce((a, b) => (b.durationMin < a.durationMin ? b : a));
  const out: Record<string, RouteDiff> = {};
  for (const r of routes) {
    const slowerMin = Math.round(r.durationMin - fastest.durationMin);
    const longerKm = Math.round((r.distanceKm - fastest.distanceKm) * 10) / 10;
    out[r.id] = {
      slowerMin: slowerMin < SAME_MIN ? 0 : slowerMin,
      longerKm: Math.abs(longerKm) < SAME_KM ? 0 : longerKm,
    };
  }
  return out;
}

/** Whether the scenic score helps choose: more than one option, and not all the same score. */
export function scenicTellsApart(routes: Comparable[]): boolean {
  if (routes.length < 2) return true;
  const scores = new Set(routes.map((r) => r.scenic?.score ?? null));
  return scores.size > 1;
}
