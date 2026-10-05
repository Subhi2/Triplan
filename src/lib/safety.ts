import { z } from "zod";
import type { LngLat } from "./geo";
import { lineStringSchema, ROUTE_ID_PATTERN } from "./places";

// Safety stops along a route (docs/02-architecture.md, "Safety stops"): hospitals, police, ATMs,
// puncture and repair shops from the service_point table. Pure helpers shared by the API and UI.

export const SAFETY_KINDS = ["hospital", "police", "atm", "tyre", "repair"] as const;
export type SafetyKind = (typeof SAFETY_KINDS)[number];

export const SAFETY_STYLE: Record<SafetyKind, { one: string; many: string; color: string }> = {
  hospital: { one: "hospital", many: "hospitals", color: "#dc2626" },
  police: { one: "police station", many: "police", color: "#1d4ed8" },
  atm: { one: "ATM", many: "ATMs", color: "#15803d" },
  tyre: { one: "puncture shop", many: "puncture shops", color: "#b45309" },
  repair: { one: "repair shop", many: "repair shops", color: "#475569" },
};

/** Service points this far from the route (straight line) count as on the way. */
export const SAFETY_CORRIDOR_KM = 3;
/** Points sent to the browser: the nearest few of each kind per stretch of road. */
const STRETCH_KM = 10;
const PER_STRETCH = 3;

export interface SafetyPoint {
  id: string; // OSM id
  kind: SafetyKind;
  name: string | null;
  phone: string | null;
  location: LngLat;
  kmFromStart: number;
  detourKm: number;
}

export interface Gap {
  fromKm: number;
  toKm: number;
  km: number;
}

export interface SafetySummary {
  totalKm: number;
  counts: Record<SafetyKind, number>;
  /** How many there are per 50 km of road, one decimal. */
  perFiftyKm: Record<SafetyKind, number>;
  /** The longest stretch without one, start and destination included. */
  longestGap: Record<SafetyKind, Gap>;
  /** A thinned set to list and pin: the nearest to the road per stretch. */
  points: SafetyPoint[];
}

/** The longest stretch of road between consecutive points (km), from 0 to `totalKm`. */
export function longestGap(kms: number[], totalKm: number): Gap {
  const stops = [0, ...kms.filter((k) => k >= 0 && k <= totalKm).sort((a, b) => a - b), totalKm];
  let best: Gap = { fromKm: 0, toKm: 0, km: 0 };
  for (let i = 1; i < stops.length; i++) {
    const km = stops[i]! - stops[i - 1]!;
    if (km > best.km) best = { fromKm: stops[i - 1]!, toKm: stops[i]!, km };
  }
  return best;
}

/** The nearest few points of each kind in each stretch of road, in km order. */
export function thinByStretch(
  points: SafetyPoint[],
  stretchKm = STRETCH_KM,
  perStretch = PER_STRETCH,
): SafetyPoint[] {
  const groups = new Map<string, SafetyPoint[]>();
  for (const p of points) {
    const key = `${p.kind}:${Math.floor(p.kmFromStart / stretchKm)}`;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  return [...groups.values()]
    .flatMap((g) => g.sort((a, b) => a.detourKm - b.detourKm).slice(0, perStretch))
    .sort((a, b) => a.kmFromStart - b.kmFromStart);
}

export function summariseSafety(points: SafetyPoint[], totalKm: number): SafetySummary {
  const counts = {} as Record<SafetyKind, number>;
  const perFiftyKm = {} as Record<SafetyKind, number>;
  const gaps = {} as Record<SafetyKind, Gap>;
  for (const kind of SAFETY_KINDS) {
    const kms = points.filter((p) => p.kind === kind).map((p) => p.kmFromStart);
    counts[kind] = kms.length;
    perFiftyKm[kind] = totalKm > 0 ? Math.round((kms.length / totalKm) * 500) / 10 : 0;
    gaps[kind] = longestGap(kms, totalKm);
  }
  return { totalKm, counts, perFiftyKm, longestGap: gaps, points: thinByStretch(points) };
}

/** Body of POST /api/services/along. */
export const safetyRequestSchema = z
  .object({
    routeId: z.string().regex(ROUTE_ID_PATTERN).optional(),
    geometry: lineStringSchema.optional(),
  })
  .refine((b) => b.routeId || b.geometry, { message: "Send routeId or geometry" });

/** A tel: link for a phone number as mapped ("+91 8173 244 444" -> "tel:+918173244444"). */
export function telLink(phone: string): string | null {
  const digits = phone.replace(/[^\d+]/g, "");
  return digits.replace(/\D/g, "").length >= 3 ? `tel:${digits}` : null;
}
