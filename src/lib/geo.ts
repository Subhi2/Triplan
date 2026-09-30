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
