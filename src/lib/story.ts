import { haversineM, type LngLat } from "./geo";
import { placeRank, type PlaceAlong } from "./places";

// What goes on a ride story poster (docs/02-architecture.md, "Ride story"): pure helpers shared
// by the server that draws it and the tests.

/**
 * Up to `count` places for the poster, spread along the route: the best place in each equal
 * stretch, then the next best anywhere, in km order.
 */
export function storyStops(places: PlaceAlong[], totalKm: number, count = 5): PlaceAlong[] {
  if (places.length === 0 || totalKm <= 0) return [];
  const better = (a: PlaceAlong, b: PlaceAlong) =>
    placeRank(b) - placeRank(a) || a.detourKm - b.detourKm;
  const chosen = new Map<string, PlaceAlong>();
  for (let i = 0; i < count; i++) {
    const [from, to] = [(i * totalKm) / count, ((i + 1) * totalKm) / count];
    const best = places.filter((p) => p.kmFromStart >= from && p.kmFromStart < to).sort(better)[0];
    if (best) chosen.set(best.id, best);
  }
  for (const p of [...places].sort(better)) {
    if (chosen.size >= count) break;
    chosen.set(p.id, p);
  }
  return [...chosen.values()].sort((a, b) => a.kmFromStart - b.kmFromStart);
}

/**
 * The line cut into runs that are, or are not, ghat (`ghats` as fractions of its length), so a
 * drawing can colour the ghats. Neighbouring runs share their joining point.
 */
export function splitByGhats(
  line: LngLat[],
  ghats: [number, number][],
): { coords: LngLat[]; ghat: boolean }[] {
  if (line.length < 2) return [];
  const along = [0];
  for (let i = 1; i < line.length; i++)
    along.push(along[i - 1]! + haversineM(line[i - 1]!, line[i]!));
  const total = along.at(-1) || 1;
  const inGhat = along.map((d) => ghats.some(([a, b]) => d / total >= a && d / total <= b));
  const runs: { coords: LngLat[]; ghat: boolean }[] = [];
  for (let i = 0; i < line.length; i++) {
    const last = runs.at(-1);
    if (last && last.ghat === inGhat[i]) last.coords.push(line[i]!);
    else
      runs.push({ coords: last ? [last.coords.at(-1)!, line[i]!] : [line[i]!], ghat: inGhat[i]! });
  }
  return runs.filter((r) => r.coords.length > 1);
}

/** Every nth point, so a long route stays a small drawing (ends kept). */
export function thinLine(line: LngLat[], maxPoints: number): LngLat[] {
  if (line.length <= maxPoints) return line;
  const step = Math.ceil(line.length / maxPoints);
  const out = line.filter((_, i) => i % step === 0);
  if (out.at(-1) !== line.at(-1)) out.push(line.at(-1)!);
  return out;
}
