import type { RoadMix } from "./trip";

// Scenic score (docs/02, "Scenic score"): how good a road is to ride for its own sake, 0–10, from
// our data only. Research on scenic beauty (Quercia et al. 2014, Seresinhe et al. 2017) uses
// street photos we do not have; mountains, coast and castles are what it finds scenic, so this
// counts ghats and twisty road, then viewpoints, waterfalls, passes, beaches, peaks and forts
// near the road. Pure.

/** Sights within this distance of the road count. */
export const SCENIC_WITHIN_M = 2000;

/**
 * What a sight adds. Lakes count little: most mapped ones on the plains are village tanks
 * (Bengaluru → Chennai passes 25 within 2 km).
 */
export const SCENIC_WEIGHTS = {
  viewpoint: 1,
  waterfall: 1,
  pass: 1,
  beach: 1,
  peak: 0.5,
  fort: 0.5,
  lake: 0.1,
} as const;
export const SCENIC_CATEGORIES = Object.keys(SCENIC_WEIGHTS) as (keyof typeof SCENIC_WEIGHTS)[];

/** Up to 7 points for the road: a third of it in ghats or twisty earns them all. */
const ROAD_POINTS = 7;
const ROAD_FULL_SHARE = 0.35;
/** Up to 3 points for sights: 3 weighted sights per 100 km earn them all. */
const SIGHT_POINTS = 3;
const SIGHTS_FULL_PER_100KM = 3;

export interface RouteScenic {
  /** 0–10, whole points. */
  score: number;
  /** Viewpoints, waterfalls, passes, beaches, peaks and forts within 2 km (lakes left out). */
  sights: number;
}

/** The score from the sights near the road (per category), the road mix and the twisty km. */
export function scenicScore({
  counts,
  distanceKm,
  roadMix,
  twistyKm,
}: {
  counts: Partial<Record<string, number>>;
  distanceKm: number;
  roadMix: RoadMix | null;
  twistyKm: number;
}): RouteScenic {
  if (!(distanceKm > 0)) return { score: 0, sights: 0 };
  let points = 0;
  let sights = 0;
  for (const c of SCENIC_CATEGORIES) {
    const n = counts[c] ?? 0;
    points += n * SCENIC_WEIGHTS[c];
    if (c !== "lake") sights += n;
  }
  const mixTotal = roadMix
    ? roadMix.nationalM + roadMix.stateM + roadMix.ghatM + roadMix.otherM
    : 0;
  const ghatShare = roadMix && mixTotal > 0 ? roadMix.ghatM / mixTotal : 0;
  const share = Math.max(ghatShare, twistyKm / distanceKm);
  const road = Math.min(ROAD_POINTS, (share / ROAD_FULL_SHARE) * ROAD_POINTS);
  const sight = Math.min(
    SIGHT_POINTS,
    ((points / distanceKm) * 100 * SIGHT_POINTS) / SIGHTS_FULL_PER_100KM,
  );
  return { score: Math.max(0, Math.min(10, Math.round(road + sight))), sights };
}

/** A route scores at least this much more than the fastest to be labelled "Scenic". */
export const SCENIC_LEAD = 1;

/**
 * The route to label "Scenic": the highest score, when it is not the fastest route and beats the
 * fastest by at least a point. Null when none does (or a score is missing).
 */
export function scenicRouteId(
  routes: { id: string; durationMin: number; scenic?: RouteScenic | null }[],
): string | null {
  if (routes.length < 2) return null;
  const fastest = routes.reduce((a, b) => (b.durationMin < a.durationMin ? b : a));
  const best = routes.reduce((a, b) => ((b.scenic?.score ?? -1) > (a.scenic?.score ?? -1) ? b : a));
  if (best.id === fastest.id || !best.scenic || !fastest.scenic) return null;
  return best.scenic.score - fastest.scenic.score >= SCENIC_LEAD ? best.id : null;
}
