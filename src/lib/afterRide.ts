import { haversineM, type LngLat } from "./geo";

/** A trip stop this close to a place is that place (G11, review after the ride). */
export const STOP_IS_PLACE_M = 300;
/** A saved trip asks for reviews once it has not changed for this long: the ride is likely done. */
export const ASK_AFTER_MS = 12 * 60 * 60 * 1000;

interface PlaceLike {
  slug: string;
  name: string;
  category: string;
  location: LngLat;
}

/**
 * The places the trip stopped at (G11, C6): for each stop, the nearest of `places` within 300 m,
 * leaving out towns, fuel and places without a page; each once, in trip order.
 */
export function placesAtStops<P extends PlaceLike>(
  stops: { location: LngLat | null }[],
  places: P[],
): P[] {
  const out: P[] = [];
  for (const s of stops) {
    if (!s.location) continue;
    let best: { p: P; m: number } | null = null;
    for (const p of places) {
      if (!p.slug || p.category === "town" || p.category === "fuel") continue;
      const m = haversineM(s.location, p.location);
      if (m <= STOP_IS_PLACE_M && (!best || m < best.m)) best = { p, m };
    }
    if (best && !out.some((o) => o.slug === best.p.slug)) out.push(best.p);
  }
  return out;
}

/** Whether to ask: a saved trip left unchanged for 12 hours. */
export function askForReviews(updatedAt: string, now = Date.now()): boolean {
  const t = Date.parse(updatedAt);
  return Number.isFinite(t) && now - t >= ASK_AFTER_MS;
}
