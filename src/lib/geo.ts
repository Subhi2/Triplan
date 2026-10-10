/** Coordinates are [lng, lat] (GeoJSON order) everywhere in code. */
export type LngLat = [number, number];

const EARTH_RADIUS_M = 6_371_008.8;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in metres. */
export function haversineM([lng1, lat1]: LngLat, [lng2, lat2]: LngLat): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

/** Initial bearing from a to b in degrees, clockwise from north (-180..180). */
export function bearingDeg([lng1, lat1]: LngLat, [lng2, lat2]: LngLat): number {
  const y = Math.sin(toRad(lng2 - lng1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lng2 - lng1));
  return (Math.atan2(y, x) * 180) / Math.PI;
}

/**
 * Points every `stepM` metres along a line (start included), so measures along a route do not
 * depend on how densely the road was mapped.
 */
export function resampleLine(coords: LngLat[], stepM: number): LngLat[] {
  if (coords.length === 0) return [];
  const out: LngLat[] = [coords[0]!];
  let next = stepM; // distance along the line of the next sample
  let travelled = 0;
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1]!;
    const b = coords[i]!;
    const d = haversineM(a, b);
    while (d > 0 && next <= travelled + d) {
      const f = (next - travelled) / d;
      out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
      next += stepM;
    }
    travelled += d;
  }
  return out;
}

/**
 * Douglas–Peucker: drops points that lie within `toleranceM` of the line through their
 * neighbours, keeping both ends. Measured on a flat projection around the line's middle, which
 * is close enough for a few metres. Iterative, so a 20,000-point route cannot overflow the stack.
 */
export function simplifyLine(coords: LngLat[], toleranceM: number): LngLat[] {
  if (coords.length <= 2) return coords;
  const midLat = toRad(coords[Math.floor(coords.length / 2)]![1]);
  const mPerDegLat = (Math.PI / 180) * EARTH_RADIUS_M;
  const mPerDegLng = mPerDegLat * Math.cos(midLat);
  const xy = coords.map(([lng, lat]) => [lng * mPerDegLng, lat * mPerDegLat] as const);
  const keep = new Uint8Array(coords.length);
  keep[0] = 1;
  keep[coords.length - 1] = 1;
  const stack: [number, number][] = [[0, coords.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    const [ax, ay] = xy[first]!;
    const [bx, by] = xy[last]!;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let worst = -1;
    let worstD = toleranceM;
    for (let i = first + 1; i < last; i++) {
      const [px, py] = xy[i]!;
      // Distance to the segment (to the end point when the segment has no length).
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
      const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      if (d > worstD) {
        worstD = d;
        worst = i;
      }
    }
    if (worst >= 0) {
      keep[worst] = 1;
      stack.push([first, worst], [worst, last]);
    }
  }
  return coords.filter((_, i) => keep[i] === 1);
}

/** Rounds to 5 decimals (~1 m), the precision used for cache keys and URLs. */
export function round5(n: number): number {
  return Math.round(n * 1e5) / 1e5;
}

/**
 * Rounds to 3 decimals (~100 m), the precision kept for the user's own position: enough to find
 * places around them, not enough to pinpoint a home. Used before a position reaches any URL,
 * request or stop.
 */
export function round3(n: number): number {
  return Math.round(n * 1e3) / 1e3;
}

export function roundLngLat3([lng, lat]: LngLat): LngLat {
  return [round3(lng), round3(lat)];
}

/**
 * Distance in metres along a line to the point on it nearest to `point`. Each segment is treated
 * as straight in a local flat projection, which is accurate enough for route geometry.
 */
export function metresAlong(coords: LngLat[], point: LngLat): number {
  const kx = Math.cos(toRad(point[1])); // shrink longitude to match latitude at this point
  let nearest = Infinity;
  let along = 0;
  let travelled = 0;
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1]!;
    const b = coords[i]!;
    const dx = (b[0] - a[0]) * kx;
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    const t =
      len2 === 0
        ? 0
        : Math.max(0, Math.min(1, ((point[0] - a[0]) * kx * dx + (point[1] - a[1]) * dy) / len2));
    const foot: LngLat = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const d = haversineM(point, foot);
    const segment = haversineM(a, b);
    if (d < nearest) {
      nearest = d;
      along = travelled + segment * t;
    }
    travelled += segment;
  }
  return along;
}

/** The point `km` along a line (by great-circle distance), clamped to its ends. */
export function pointAtKm(coords: LngLat[], km: number): LngLat | null {
  if (coords.length === 0) return null;
  let left = km * 1000;
  if (left <= 0) return coords[0]!;
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1]!;
    const b = coords[i]!;
    const d = haversineM(a, b);
    if (d >= left && d > 0) {
      const f = left / d;
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    }
    left -= d;
  }
  return coords.at(-1)!;
}
