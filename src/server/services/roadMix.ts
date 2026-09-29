import type { LineString } from "geojson";
import { bearingDeg, resampleLine, type LngLat } from "@/lib/geo";
import type { RoadMix } from "@/lib/trip";
import type { RouteResult } from "../providers/routing";

export type RoadClass = "national" | "state" | "other";

/** "NH75", "NH 48; AH47", "NE4" are national; "SH 57", "SH-07" state; MDRs and the rest other. */
export function roadClass(ref: string | null): RoadClass {
  if (!ref) return "other";
  if (/\b(NH|NE)\s*-?\s*\d/i.test(ref)) return "national";
  if (/\bSH\s*-?\s*\d/i.test(ref)) return "state";
  return "other";
}

// Ghat detection, calibrated on real routes (Gudalur–Nilgiris, Kottigehara–Kalasa, Khambatki,
// Amboli): a ghat is a stretch that turns at least 300° per km, averaged over 2 km, for 2 km or
// more. Straight highways turn under 100°/km; a city junction or roundabout is too short to count.
const SAMPLE_M = 25;
const WINDOW_M = 2_000;
const MIN_TURN_DEG_PER_KM = 300;
const MAX_GAP_M = 1_000; // bends separated by less than this are one ghat
const MIN_GHAT_M = 2_000;

/** Ghat sections as [from, to] fractions (0–1) of the route length, in route order. */
export function ghatSections(geometry: LineString): [number, number][] {
  const pts = resampleLine(geometry.coordinates as LngLat[], SAMPLE_M);
  if (pts.length < 3) return [];

  // Absolute change of direction at each sample, in degrees.
  const turns = [0];
  for (let i = 1; i < pts.length - 1; i++) {
    let d = bearingDeg(pts[i]!, pts[i + 1]!) - bearingDeg(pts[i - 1]!, pts[i]!);
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    turns.push(Math.abs(d));
  }
  turns.push(0);

  const prefix = [0];
  for (const t of turns) prefix.push(prefix.at(-1)! + t);
  const half = Math.round(WINDOW_M / SAMPLE_M / 2);
  const winding = (i: number) => {
    const a = Math.max(0, i - half);
    const b = Math.min(turns.length, i + half);
    return ((prefix[b]! - prefix[a]!) / ((b - a) * SAMPLE_M)) * 1000 >= MIN_TURN_DEG_PER_KM;
  };

  const runs: [number, number][] = [];
  for (let i = 0; i < turns.length; i++) {
    if (!winding(i)) continue;
    const last = runs.at(-1);
    if (last && (i - last[1]) * SAMPLE_M <= MAX_GAP_M) last[1] = i;
    else runs.push([i, i]);
  }
  const n = pts.length - 1;
  return runs.filter(([a, b]) => (b - a) * SAMPLE_M >= MIN_GHAT_M).map(([a, b]) => [a / n, b / n]);
}

function overlap([a, b]: [number, number], [c, d]: [number, number]): number {
  return Math.max(0, Math.min(b, d) - Math.max(a, c));
}

/**
 * Splits a route's distance into national highway, state highway, ghat and other roads, from
 * the road numbers the routing engine reports and the ghat sections of the geometry. Null when
 * the engine gave no road stretches.
 */
export function roadMix(route: RouteResult): RoadMix | null {
  const roads = route.roads;
  const roadsM = roads?.reduce((s, r) => s + r.distanceM, 0) ?? 0;
  if (!roads || roadsM <= 0) return null;

  const ghats = ghatSections(route.geometry);
  const mix: RoadMix = { nationalM: 0, stateM: 0, ghatM: 0, otherM: 0, ghats };
  let at = 0;
  for (const road of roads) {
    const span: [number, number] = [at / roadsM, (at + road.distanceM) / roadsM];
    at += road.distanceM;
    const ghatShare = ghats.reduce((s, g) => s + overlap(span, g), 0);
    const rest = span[1] - span[0] - ghatShare;
    mix.ghatM += ghatShare * route.distanceM;
    const key = { national: "nationalM", state: "stateM", other: "otherM" } as const;
    mix[key[roadClass(road.ref)]] += rest * route.distanceM;
  }
  return mix;
}
