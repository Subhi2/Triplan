// The road book's "Worth stopping for" (G10, C4) when the rider ticked no places: the best stops
// spread along the road, not the first fifteen in km order (which were all in the start city).

/** Places this close to the start are the city the rider leaves: 10% of the ride, at most 25 km. */
function startSkipKm(totalKm: number): number {
  return Math.min(25, totalKm * 0.1);
}

/**
 * Up to `count` places: the best-ranked (`rank`, the planner's placeRank) in each of `count`
 * equal stretches of the road past the start city, then the best of the rest; in km order.
 */
export function spreadStops<P extends { kmFromStart: number }>(
  places: P[],
  totalKm: number,
  rank: (p: P) => number,
  count = 15,
): P[] {
  const skip = startSkipKm(totalKm);
  const pool = places.filter((p) => p.kmFromStart >= skip);
  if (pool.length <= count) return [...pool].sort((a, b) => a.kmFromStart - b.kmFromStart);
  const stretch = (totalKm - skip) / count;
  const picked = new Set<P>();
  for (let i = 0; i < count; i++) {
    const from = skip + i * stretch;
    const best = pool
      .filter((p) => p.kmFromStart >= from && p.kmFromStart < from + stretch)
      .sort((a, b) => rank(b) - rank(a))[0];
    if (best) picked.add(best);
  }
  for (const p of [...pool].sort((a, b) => rank(b) - rank(a))) {
    if (picked.size >= count) break;
    picked.add(p);
  }
  return [...picked].sort((a, b) => a.kmFromStart - b.kmFromStart);
}
