import { z } from "zod";
import { lineStringSchema, ROUTE_ID_PATTERN } from "./places";

// The elevation profile of a route (docs/02-architecture.md, "Elevation profile"): heights every
// 100 m from terrain tiles, cleaned of bridge and valley spikes, with the total climb and each big
// climb. Pure code, shared by the server (which builds profiles) and the browser (which draws them).

export const PROFILE_SAMPLE_M = 100;
/** Points kept for the chart and the 3D preview; peaks and valleys survive the downsampling. */
export const PROFILE_POINTS = 300;
/**
 * Roads seldom climb more than this over 100 m. Terrain tiles know nothing of tunnels, so the hill
 * above one shows as a steep bump; heights are kept under a slope of this gradient from either
 * side, which flattens such bumps and leaves real climbs alone.
 */
const MAX_ROAD_GRADE = 0.12;
/** Small ups and downs inside this band do not count towards the total climb. */
const HYSTERESIS_M = 10;
/** A climb (or descent) worth naming: at least this much height at this average gradient. */
export const MIN_CLIMB_M = 200;
export const MIN_CLIMB_GRADE_PCT = 3;
/** Road counts as climbing where its gradient over the surrounding km (±5 samples) is this. */
const STEEP_GRADE = 0.02;
const CLIMB_WINDOW_HALF = 5;
/** A climb carries on across flat or dipping gaps up to this long that lose at most CLIMB_DIP_M. */
const MAX_GAP_KM = 1;
const CLIMB_DIP_M = 40;

export interface Climb {
  fromKm: number;
  toKm: number;
  gainM: number; // positive for both directions
  gradePct: number; // average, one decimal
  dir: "up" | "down";
  /** The town nearest the top (for a climb) or bottom (for a descent), if one is close. */
  near: string | null;
}

export interface ElevationProfile {
  v: 1;
  zoom: number; // terrain tile zoom read
  /** [km from start, metres], downsampled to about PROFILE_POINTS. */
  points: [number, number][];
  ascentM: number;
  descentM: number;
  highest: { km: number; m: number };
  lowest: { km: number; m: number };
  climbs: Climb[];
}

export const elevationProfileSchema = z.object({
  v: z.literal(1),
  zoom: z.number().int(),
  points: z.array(z.tuple([z.number(), z.number()])).min(2),
  ascentM: z.number(),
  descentM: z.number(),
  highest: z.object({ km: z.number(), m: z.number() }),
  lowest: z.object({ km: z.number(), m: z.number() }),
  climbs: z.array(
    z.object({
      fromKm: z.number(),
      toKm: z.number(),
      gainM: z.number(),
      gradePct: z.number(),
      dir: z.enum(["up", "down"]),
      near: z.string().nullable(),
    }),
  ),
});

/**
 * Fills gaps (null heights) by straight lines between their neighbours, removes spikes (a median
 * of 5, which drops a bridge deck or a valley pixel), flattens bumps steeper than a road can climb
 * (tunnels) and smooths (a mean of 3). `stepM` is the spacing of the heights. Null if every
 * height is missing.
 */
export function cleanHeights(raw: (number | null)[], stepM = PROFILE_SAMPLE_M): number[] | null {
  const known = raw.flatMap((h, i) => (h === null ? [] : [i]));
  if (known.length === 0) return null;
  const filled = raw.map((h, i) => {
    if (h !== null) return h;
    const after = known.find((k) => k > i);
    const before = [...known].reverse().find((k) => k < i);
    if (before === undefined) return raw[after!]!;
    if (after === undefined) return raw[before]!;
    const t = (i - before) / (after - before);
    return raw[before]! * (1 - t) + raw[after]! * t;
  });
  const window = (arr: number[], i: number, half: number) =>
    arr.slice(Math.max(0, i - half), Math.min(arr.length, i + half + 1));
  const median = filled.map((_, i) => {
    const w = window(filled, i, 2).sort((a, b) => a - b);
    return w[Math.floor(w.length / 2)]!;
  });
  // After the median, so a one-sample dip under a bridge does not spread into a wide V.
  const rise = MAX_ROAD_GRADE * stepM;
  for (let i = 1; i < median.length; i++) median[i] = Math.min(median[i]!, median[i - 1]! + rise);
  for (let i = median.length - 2; i >= 0; i--) {
    median[i] = Math.min(median[i]!, median[i + 1]! + rise);
  }
  return median.map((_, i) => {
    const w = window(median, i, 1);
    return w.reduce((s, h) => s + h, 0) / w.length;
  });
}

/** Total climb and descent, ignoring wiggles smaller than the hysteresis band. */
export function ascentDescent(heights: number[]): { ascentM: number; descentM: number } {
  let ascentM = 0;
  let descentM = 0;
  let ref = heights[0] ?? 0;
  for (const h of heights) {
    if (h - ref >= HYSTERESIS_M) {
      ascentM += h - ref;
      ref = h;
    } else if (ref - h >= HYSTERESIS_M) {
      descentM += ref - h;
      ref = h;
    }
  }
  return { ascentM: Math.round(ascentM), descentM: Math.round(descentM) };
}

/**
 * Index ranges [low, high] of climbs in the direction of the arrays. A climb is a run of road
 * whose gradient over the surrounding km is 2% or more, carried over flat gaps of up to 1 km
 * that lose little height, then measured from its lowest point to its highest.
 */
function climbsUp(km: number[], h: number[]): [number, number][] {
  const n = h.length;
  const steep: boolean[] = h.map((_, i) => {
    const a = Math.max(0, i - CLIMB_WINDOW_HALF);
    const b = Math.min(n - 1, i + CLIMB_WINDOW_HALF);
    const lengthM = (km[b]! - km[a]!) * 1000;
    return lengthM > 0 && (h[b]! - h[a]!) / lengthM >= STEEP_GRADE;
  });

  // Runs of steep road, joined across short gaps that do not drop much.
  const runs: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    if (!steep[i]) continue;
    const last = runs.at(-1);
    if (last && km[i]! - km[last[1]]! <= MAX_GAP_KM) {
      let dip = h[last[1]]!;
      for (let j = last[1]; j <= i; j++) dip = Math.min(dip, h[j]!);
      if (h[last[1]]! - dip <= CLIMB_DIP_M) {
        last[1] = i;
        continue;
      }
    }
    runs.push([i, i]);
  }

  const out: [number, number][] = [];
  for (const [a0, b0] of runs) {
    const a = Math.max(0, a0 - CLIMB_WINDOW_HALF);
    const b = Math.min(n - 1, b0 + CLIMB_WINDOW_HALF);
    let high = a;
    for (let j = a; j <= b; j++) if (h[j]! > h[high]!) high = j;
    let low = a;
    for (let j = a; j <= high; j++) if (h[j]! <= h[low]!) low = j; // the last of equal lows
    const gain = h[high]! - h[low]!;
    const lengthM = (km[high]! - km[low]!) * 1000;
    if (gain >= MIN_CLIMB_M && lengthM > 0 && (100 * gain) / lengthM >= MIN_CLIMB_GRADE_PCT) {
      const prev = out.at(-1);
      if (prev && low <= prev[1])
        prev[1] = Math.max(prev[1], high); // overlapping windows
      else out.push([low, high]);
    }
  }
  return out;
}

/**
 * Climbs and descents of at least MIN_CLIMB_M at MIN_CLIMB_GRADE_PCT or steeper, in road order.
 * `nearTown(km)` names the town nearest a climb's top (or a descent's bottom).
 */
export function findClimbs(
  km: number[],
  heights: number[],
  nearTown: (km: number) => string | null = () => null,
): Climb[] {
  const climb = (a: number, b: number, dir: Climb["dir"]): Climb => {
    const gainM = Math.abs(heights[b]! - heights[a]!);
    const lengthM = Math.abs(km[b]! - km[a]!) * 1000;
    const fromKm = Math.min(km[a]!, km[b]!);
    const toKm = Math.max(km[a]!, km[b]!);
    return {
      fromKm: Math.round(fromKm * 10) / 10,
      toKm: Math.round(toKm * 10) / 10,
      gainM: Math.round(gainM),
      gradePct: Math.round((1000 * gainM) / lengthM) / 10,
      dir,
      near: nearTown(dir === "up" ? km[b]! : km[a]!),
    };
  };
  const ups = climbsUp(km, heights).map(([a, b]) => climb(a, b, "up"));
  // A descent is a climb read backwards.
  const n = heights.length - 1;
  const revKm = [...km].reverse().map((k) => km[n]! - k);
  const downs = climbsUp(revKm, [...heights].reverse()).map(([a, b]) =>
    climb(n - b, n - a, "down"),
  );
  return [...ups, ...downs].sort((x, y) => x.fromKm - y.fromKm);
}

/**
 * Largest-Triangle-Three-Buckets downsampling: keeps the shape (peaks, valleys, steep steps)
 * with far fewer points.
 */
export function lttb(points: [number, number][], threshold: number): [number, number][] {
  if (threshold >= points.length || threshold < 3) return points;
  const out: [number, number][] = [points[0]!];
  const bucket = (points.length - 2) / (threshold - 2);
  let a = 0;
  for (let i = 0; i < threshold - 2; i++) {
    const start = Math.floor(i * bucket) + 1;
    const end = Math.min(points.length - 1, Math.floor((i + 1) * bucket) + 1);
    const nextEnd = Math.min(points.length, Math.floor((i + 2) * bucket) + 1);
    let avgX = 0;
    let avgY = 0;
    for (let j = end; j < nextEnd; j++) {
      avgX += points[j]![0];
      avgY += points[j]![1];
    }
    const count = Math.max(1, nextEnd - end);
    avgX /= count;
    avgY /= count;
    let best = start;
    let bestArea = -1;
    const [ax, ay] = points[a]!;
    for (let j = start; j < end; j++) {
      const [bx, by] = points[j]!;
      const area = Math.abs((ax - avgX) * (by - ay) - (ax - bx) * (avgY - ay));
      if (area > bestArea) {
        bestArea = area;
        best = j;
      }
    }
    out.push(points[best]!);
    a = best;
  }
  out.push(points.at(-1)!);
  return out;
}

/** Height at `km` along a profile, straight between its points. */
export function elevationAt(profile: Pick<ElevationProfile, "points">, km: number): number {
  const pts = profile.points;
  if (km <= pts[0]![0]) return pts[0]![1];
  for (let i = 1; i < pts.length; i++) {
    const [k1, m1] = pts[i]!;
    if (km <= k1) {
      const [k0, m0] = pts[i - 1]!;
      return k1 === k0 ? m1 : m0 + ((m1 - m0) * (km - k0)) / (k1 - k0);
    }
  }
  return pts.at(-1)![1];
}

/** The climb (or descent) under `km`, if any. */
export function climbAt(profile: Pick<ElevationProfile, "climbs">, km: number): Climb | null {
  return profile.climbs.find((c) => km >= c.fromKm && km <= c.toKm) ?? null;
}

/** Builds a profile from heights every PROFILE_SAMPLE_M (the last point may be closer). */
export function buildProfile(
  km: number[],
  heights: number[],
  zoom: number,
  nearTown?: (km: number) => string | null,
): ElevationProfile {
  let hi = 0;
  let lo = 0;
  heights.forEach((h, i) => {
    if (h > heights[hi]!) hi = i;
    if (h < heights[lo]!) lo = i;
  });
  const all = km.map((k, i): [number, number] => [k, heights[i]!]);
  return {
    v: 1,
    zoom,
    points: lttb(all, PROFILE_POINTS).map(([k, m]) => [Math.round(k * 100) / 100, Math.round(m)]),
    ...ascentDescent(heights),
    highest: { km: Math.round(km[hi]! * 10) / 10, m: Math.round(heights[hi]!) },
    lowest: { km: Math.round(km[lo]! * 10) / 10, m: Math.round(heights[lo]!) },
    climbs: findClimbs(km, heights, nearTown),
  };
}

/** Body of POST /api/route/profile: a route id from POST /api/route, or the route's geometry. */
export const profileRequestSchema = z
  .object({
    routeId: z.string().regex(ROUTE_ID_PATTERN).optional(),
    geometry: lineStringSchema.optional(),
  })
  .refine((b) => b.routeId || b.geometry, { message: "Send routeId or geometry" });
