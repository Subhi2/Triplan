import { bearingDeg, haversineM, resampleLine, type LngLat } from "./geo";

// The 3D ride preview's camera (docs/02-architecture.md, "3D ride preview"): pure functions from
// the route to where the camera is and where it looks at each moment, so they can be tested and
// shared by the live preview and the recorded video.

const STEP_M = 50;
/** The camera's target is averaged over ±150 m so it does not jerk round every bend. */
const SMOOTH_SAMPLES = 3;
/** The camera looks this far ahead along the road; nearer in ghats so the bends stay in view. */
const LOOK_AHEAD_KM = 1.2;
const LOOK_AHEAD_GHAT_KM = 0.6;
/** Ghats get this many times the screen time of open road; hairpins and places get SLOW_WEIGHT. */
const GHAT_WEIGHT = 4;
const SLOW_WEIGHT = 3;
const SLOW_WITHIN_KM = 0.5;

export const FLY_PITCH = 62;
const ZOOM_OPEN = 11.6;
const ZOOM_GHAT = 13.4;

export interface FlyPath {
  pts: LngLat[];
  km: number[];
  totalKm: number;
  /** 0–1 per point: how much of the surrounding 2 km is ghat (eases the zoom in and out). */
  ghatShare: number[];
  /** Cumulative screen time at each point, 0 at the start and 1 at the end. */
  time: number[];
}

/** Seconds a route takes at 1×: about 90 s for 300 km, between 45 s and 150 s. */
export function flySeconds(totalKm: number): number {
  return Math.max(45, Math.min(150, 45 + totalKm * 0.15));
}

/**
 * Samples the route every 50 m and works out how much screen time each stretch gets: ghats,
 * hairpins and places linger, open highway hurries.
 */
export function buildFlyPath(
  coords: LngLat[],
  ghats: [number, number][],
  slowKm: number[] = [],
): FlyPath {
  // km along the road itself (as the profile and the places measure it), not between samples,
  // which would cut the corners of every bend.
  const pts = resampleLine(coords, STEP_M);
  const km = pts.map((_, i) => (i * STEP_M) / 1000);
  let lengthM = 0;
  for (let i = 1; i < coords.length; i++) lengthM += haversineM(coords[i - 1]!, coords[i]!);
  const last = coords.at(-1);
  if (last && pts.length > 0 && lengthM / 1000 - km.at(-1)! > 0.001) {
    pts.push(last);
    km.push(lengthM / 1000);
  }
  const totalKm = km.at(-1) ?? 0;

  const inGhat = km.map((k) => ghats.some(([a, b]) => k >= a * totalKm && k <= b * totalKm));
  const window = Math.round(1000 / STEP_M);
  const ghatShare = inGhat.map((_, i) => {
    let n = 0;
    let g = 0;
    for (let j = Math.max(0, i - window); j <= Math.min(inGhat.length - 1, i + window); j++) {
      n++;
      if (inGhat[j]) g++;
    }
    return g / n;
  });

  const sortedSlow = [...slowKm].sort((a, b) => a - b);
  const nearSlow = (k: number) => {
    // Few slow points: a linear scan is fine.
    for (const s of sortedSlow) {
      if (s > k + SLOW_WITHIN_KM) break;
      if (Math.abs(s - k) <= SLOW_WITHIN_KM) return true;
    }
    return false;
  };
  const time: number[] = [0];
  for (let i = 1; i < pts.length; i++) {
    const mid = (km[i - 1]! + km[i]!) / 2;
    const w = Math.max(inGhat[i] ? GHAT_WEIGHT : 1, nearSlow(mid) ? SLOW_WEIGHT : 1);
    time.push(time[i - 1]! + w * (km[i]! - km[i - 1]!));
  }
  const total = time.at(-1) || 1;
  return { pts, km, totalKm, ghatShare, time: time.map((t) => t / total) };
}

/** Index of the last element of a sorted array that is <= value. */
function floorIndex(arr: number[], value: number): number {
  let lo = 0;
  let hi = arr.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (arr[mid]! <= value) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function interpolate(arr: number[], from: number[], value: number): number {
  const i = floorIndex(from, value);
  if (i >= from.length - 1) return arr.at(-1)!;
  const span = from[i + 1]! - from[i]!;
  const f = span > 0 ? (value - from[i]!) / span : 0;
  return arr[i]! + (arr[i + 1]! - arr[i]!) * f;
}

/** km along the route at a moment of the flyover (0–1 of its screen time). */
export function kmAtTime(path: FlyPath, t: number): number {
  return interpolate(path.km, path.time, Math.max(0, Math.min(1, t)));
}

/** The moment of the flyover (0–1) at which the camera reaches `km`. */
export function timeAtKm(path: FlyPath, km: number): number {
  return interpolate(path.time, path.km, Math.max(0, Math.min(path.totalKm, km)));
}

/** The point on the route at `km`. */
export function pointAt(path: FlyPath, km: number): LngLat {
  const i = floorIndex(path.km, km);
  if (i >= path.pts.length - 1) return path.pts.at(-1)!;
  const span = path.km[i + 1]! - path.km[i]!;
  const f = span > 0 ? (km - path.km[i]!) / span : 0;
  const [a, b] = [path.pts[i]!, path.pts[i + 1]!];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}

/** The camera's target: the route point at `km`, averaged with its neighbours. */
export function targetAt(path: FlyPath, km: number): LngLat {
  const i = floorIndex(path.km, km);
  let lng = 0;
  let lat = 0;
  let n = 0;
  for (
    let j = Math.max(0, i - SMOOTH_SAMPLES);
    j <= Math.min(path.pts.length - 1, i + SMOOTH_SAMPLES);
    j++
  ) {
    lng += path.pts[j]![0];
    lat += path.pts[j]![1];
    n++;
  }
  return [lng / n, lat / n];
}

function ghatShareAt(path: FlyPath, km: number): number {
  return interpolate(path.ghatShare, path.km, km);
}

/** Where the camera should face at `km`: from its target towards the road ahead. */
export function lookBearing(path: FlyPath, km: number): number {
  const share = ghatShareAt(path, km);
  const ahead = LOOK_AHEAD_KM + (LOOK_AHEAD_GHAT_KM - LOOK_AHEAD_KM) * share;
  const from = targetAt(path, km);
  const to = targetAt(path, Math.min(path.totalKm, km + ahead));
  if (haversineM(from, to) < 5) return lookBearing(path, Math.max(0, km - ahead));
  return bearingDeg(from, to);
}

/** Closer in through ghats, wider on open road. */
export function zoomAt(path: FlyPath, km: number): number {
  return ZOOM_OPEN + (ZOOM_GHAT - ZOOM_OPEN) * ghatShareAt(path, km);
}

/**
 * Turns `prev` towards `target` along the shorter way round, by how much of the gap closes in
 * `dtS` seconds with time constant `tauS`. Keeps the camera from snapping round a hairpin.
 */
export function smoothAngle(prev: number, target: number, dtS: number, tauS: number): number {
  let d = ((((target - prev) % 360) + 540) % 360) - 180;
  if (d === -180) d = 180;
  const k = 1 - Math.exp(-dtS / Math.max(1e-6, tauS));
  return prev + d * k;
}
