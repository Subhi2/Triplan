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
