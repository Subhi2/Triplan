import type { LineString } from "geojson";
import { bearingDeg, haversineM, resampleLine, type LngLat } from "./geo";

// How twisty a road is, from its shape alone (docs/02-architecture.md, "Hairpins and twistiness").
//
// The road is resampled every 25 m. At each sample the circle through it and its two neighbours
// gives the radius of the bend there: R = s / (2·sin(θ/2)) for samples s apart turning by θ.
// Each 25 m is weighted by how tight its bend is, with the weights roadcurvature.com publishes,
// so a road's "curvature" is roughly the distance spent in real bends (tight ones count double).

const SAMPLE_M = 25;

/** [minimum radius in metres, weight] from the widest band to the tightest. */
const WEIGHTS: [number, number][] = [
  [175, 0], // straight or a sweeping curve
  [100, 1], // broad bend
  [60, 1.3], // medium bend
  [30, 1.6], // tight bend
  [0, 2], // very tight: hairpins and switchbacks
];

/** A km of road is "twisty" when its weighted bends add up to this many metres. */
const TWISTY_M_PER_KM = 450;
const TWISTY_WINDOW_M = 1_000;

// A hairpin: the road turns back on itself (150° or more) within a short stretch, and leaves the
// bend heading the other way. Roundabouts are ruled out because the road leaves them in about the
// direction it came, and loops because they turn far more than a hairpin.
const HAIRPIN_TURN_DEG = 150;
const HAIRPIN_MAX_M = 125;
const HAIRPIN_MAX_TOTAL_DEG = 240;
const HAIRPIN_ARM_M = 50; // heading before and after the bend, measured over this length
const HAIRPIN_MERGE_M = 100;
/** Near the ends and the stops the router may turn round; those are not hairpins. */
const STOP_MARGIN_M = 300;

export type TwistLabel = "Straight" | "Some bends" | "Twisty" | "Very twisty";

export interface RouteCurvature {
  /** Weighted metres of bends over the whole route (roadcurvature.com's "curvature"). */
  curvatureM: number;
  /** Length of road whose surrounding km is twisty. */
  twistyKm: number;
  label: TwistLabel;
  hairpins: number;
  /** Where each hairpin is, in km from the start (one decimal). */
  hairpinKm: number[];
}

function weight(radiusM: number): number {
  for (const [min, w] of WEIGHTS) if (radiusM > min) return w;
  return WEIGHTS.at(-1)![1];
}

/** Signed change of heading from a to b, in degrees (-180..180). */
function turnDeg(a: number, b: number): number {
  let d = b - a;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

export function twistLabel(twistyKm: number): TwistLabel {
  if (twistyKm >= 60) return "Very twisty";
  if (twistyKm >= 25) return "Twisty";
  if (twistyKm >= 5) return "Some bends";
  return "Straight";
}

/**
 * Twistiness and hairpins of a route. `stops` are the trip's via stops (and ends): the router can
 * double back at a stop, which must not count as a hairpin.
 */
export function routeCurvature(geometry: LineString, stops: LngLat[] = []): RouteCurvature {
  const pts = resampleLine(geometry.coordinates as LngLat[], SAMPLE_M);
  const empty: RouteCurvature = {
    curvatureM: 0,
    twistyKm: 0,
    label: "Straight",
    hairpins: 0,
    hairpinKm: [],
  };
  if (pts.length < 3) return empty;

  // Heading of each 25 m segment, and the signed turn at each inner sample.
  const heading: number[] = [];
  for (let i = 0; i < pts.length - 1; i++) heading.push(bearingDeg(pts[i]!, pts[i + 1]!));
  const turns: number[] = [0];
  for (let i = 1; i < heading.length; i++) turns.push(turnDeg(heading[i - 1]!, heading[i]!));
  turns.push(0);

  // Weighted curvature at each sample, and in total.
  const bend = turns.map((t) => {
    const theta = (Math.abs(t) * Math.PI) / 180;
    const radius = theta === 0 ? Infinity : SAMPLE_M / (2 * Math.sin(theta / 2));
    return weight(radius) * SAMPLE_M;
  });
  const curvatureM = bend.reduce((s, b) => s + b, 0);

  // Twisty km: samples whose surrounding km has enough weighted bends.
  const prefix = [0];
  for (const b of bend) prefix.push(prefix.at(-1)! + b);
  const half = Math.round(TWISTY_WINDOW_M / SAMPLE_M / 2);
  let twistySamples = 0;
  for (let i = 0; i < bend.length; i++) {
    const a = Math.max(0, i - half);
    const b = Math.min(bend.length, i + half);
    const perKm = ((prefix[b]! - prefix[a]!) / ((b - a) * SAMPLE_M)) * 1000;
    if (perKm >= TWISTY_M_PER_KM) twistySamples++;
  }
  const twistyKm = (twistySamples * SAMPLE_M) / 1000;

  const hairpinKm = findHairpins(pts, heading, turns, stops);
  return {
    curvatureM: Math.round(curvatureM),
    twistyKm: Math.round(twistyKm * 10) / 10,
    label: twistLabel(twistyKm),
    hairpins: hairpinKm.length,
    hairpinKm,
  };
}

function findHairpins(
  pts: LngLat[],
  heading: number[],
  turns: number[],
  stops: LngLat[],
): number[] {
  const n = pts.length;
  const span = Math.round(HAIRPIN_MAX_M / SAMPLE_M);
  const arm = Math.round(HAIRPIN_ARM_M / SAMPLE_M);
  const margin = Math.round(STOP_MARGIN_M / SAMPLE_M);
  const nearStop = (i: number) => stops.some((s) => haversineM(s, pts[i]!) < STOP_MARGIN_M);

  const found: number[] = []; // sample index of each hairpin's apex
  let i = margin;
  while (i < n - margin) {
    // The shortest stretch starting here that turns back on itself.
    let net = 0;
    let total = 0;
    let end = -1;
    for (let j = i; j < Math.min(n - 1, i + span); j++) {
      net += turns[j]!;
      total += Math.abs(turns[j]!);
      if (Math.abs(net) >= HAIRPIN_TURN_DEG) {
        end = j;
        break;
      }
    }
    if (end < 0) {
      i++;
      continue;
    }
    const before = heading[Math.max(0, i - arm)]!;
    const after = heading[Math.min(heading.length - 1, end + arm - 1)]!;
    const apex = Math.round((i + end) / 2);
    const reversed = Math.abs(turnDeg(before, after)) >= HAIRPIN_TURN_DEG;
    if (reversed && total <= HAIRPIN_MAX_TOTAL_DEG && apex < n - margin && !nearStop(apex)) {
      const last = found.at(-1);
      if (last === undefined || (apex - last) * SAMPLE_M >= HAIRPIN_MERGE_M) found.push(apex);
      i = end + 1;
    } else {
      i++;
    }
  }
  return found.map((idx) => Math.round((idx * SAMPLE_M) / 100) / 10);
}
