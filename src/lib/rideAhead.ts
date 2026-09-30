import { bearingDeg, haversineM, type LngLat } from "./geo";
import { nearbyRank, type PlaceNear } from "./nearby";

/**
 * Ride mode ("Ahead of you"): the well-known places coming up in the direction the rider is
 * moving. Pure functions, driven by the phone's position fixes (useRideAhead).
 */

/** A position fix from the browser (GeolocationPosition, flattened). */
export interface Fix {
  location: LngLat;
  accuracyM: number;
  /** The device's own heading, when it reports one (degrees from north). */
  headingDeg: number | null;
  speedMps: number | null;
}

export interface HeadingState {
  headingDeg: number | null;
  /** Where the heading was last measured; the next bearing is taken from here. */
  anchor: LngLat | null;
}

export const NO_HEADING: HeadingState = { headingDeg: null, anchor: null };

/** Fixes less accurate than this are ignored (a jump of the dot, not a move). */
export const MAX_FIX_ACCURACY_M = 150;
/** The device's heading is trusted only when moving at least this fast (~7 km/h). */
export const MIN_HEADING_SPEED_MPS = 2;
/** Otherwise the heading is the bearing over at least this much movement. */
export const MIN_MOVE_M = 60;
/** Weight of a new heading against the old one: smooths bends in the road. */
const HEADING_SMOOTHING = 0.5;

/** Places ahead: within this angle either side of the heading... */
export const AHEAD_CONE_DEG = 35;
/** ...or this, for a place already shown, so it does not flicker on a bend. */
export const AHEAD_KEEP_DEG = 45;
export const AHEAD_MIN_KM = 0.3;
export const AHEAD_MAX_KM = 30;
export const AHEAD_COUNT = 6;

/** Ask for places again after moving this far, and no more often than every minute. */
export const REQUERY_MOVE_M = 2_000;
export const REQUERY_MIN_MS = 60_000;

const norm = (deg: number) => ((deg % 360) + 360) % 360;

/** Signed turn from heading `a` to bearing `b`, -180..180 (positive: to the right). */
export function angleDiff(a: number, b: number): number {
  return norm(b - a + 180) - 180;
}

/** The heading after a new fix, or the previous one when the fix tells nothing new. */
export function nextHeading(prev: HeadingState, fix: Fix): HeadingState {
  if (fix.accuracyM > MAX_FIX_ACCURACY_M) return prev;

  let measured: number | null = null;
  if (
    fix.headingDeg !== null &&
    Number.isFinite(fix.headingDeg) &&
    (fix.speedMps ?? 0) >= MIN_HEADING_SPEED_MPS
  ) {
    measured = fix.headingDeg;
  } else if (prev.anchor && haversineM(prev.anchor, fix.location) >= MIN_MOVE_M) {
    measured = bearingDeg(prev.anchor, fix.location);
  }

  if (measured === null) {
    // Standing still (or barely moving): keep the heading; the first fix only sets the anchor.
    return prev.anchor ? prev : { headingDeg: prev.headingDeg, anchor: fix.location };
  }
  const heading =
    prev.headingDeg === null
      ? measured
      : prev.headingDeg + angleDiff(prev.headingDeg, measured) * HEADING_SMOOTHING;
  return { headingDeg: norm(heading), anchor: fix.location };
}

export function shouldRequery(
  last: { at: LngLat; t: number } | null,
  at: LngLat,
  now: number,
): boolean {
  if (!last) return true;
  return haversineM(last.at, at) >= REQUERY_MOVE_M && now - last.t >= REQUERY_MIN_MS;
}

export interface AheadPlace {
  place: PlaceNear;
  distanceKm: number;
  /** Turn from the heading to the place, -180..180: for the arrow. */
  turnDeg: number;
}

/**
 * The best places inside the cone ahead, nearest first. `shownIds` are the ones on screen now:
 * they get a slightly wider cone so a bend in the road does not make them blink out and back.
 */
export function placesAhead(
  places: PlaceNear[],
  me: LngLat,
  headingDeg: number,
  shownIds: ReadonlySet<string>,
  month: number,
): AheadPlace[] {
  const inCone: AheadPlace[] = [];
  for (const place of places) {
    const distanceKm = haversineM(me, place.location) / 1000;
    if (distanceKm < AHEAD_MIN_KM || distanceKm > AHEAD_MAX_KM) continue;
    const turnDeg = angleDiff(headingDeg, bearingDeg(me, place.location));
    const limit = shownIds.has(place.id) ? AHEAD_KEEP_DEG : AHEAD_CONE_DEG;
    if (Math.abs(turnDeg) <= limit) inCone.push({ place, distanceKm, turnDeg });
  }
  return inCone
    .sort((a, b) => nearbyRank(b.place, month) - nearbyRank(a.place, month))
    .slice(0, AHEAD_COUNT)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

/** "NW" for 315°. */
export function compassPoint(deg: number): (typeof COMPASS)[number] {
  return COMPASS[Math.round(norm(deg) / 45) % 8]!;
}
