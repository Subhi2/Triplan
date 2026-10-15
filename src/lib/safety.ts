import { z } from "zod";
import type { LngLat } from "./geo";
import { lineStringSchema, ROUTE_ID_PATTERN } from "./places";

// Safety stops along a route (docs/02-architecture.md, "Safety stops"): hospitals, police, ATMs,
// puncture and repair shops from the service_point table, and the toll plazas on the road (G5).
// Pure helpers shared by the API and UI.

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

/** Toll booths this close to the route (straight line) are on it. */
export const TOLL_CORRIDOR_KM = 0.2;
/** Booths closer than this along the road are one plaza (one booth per carriageway or lane). */
const ONE_PLAZA_KM = 1;

export interface TollPlaza {
  id: string; // OSM id of its first booth
  name: string | null;
  location: LngLat;
  kmFromStart: number;
}

/** Toll booths on the road as plazas, in km order: booths within 1 km of each other are one. */
export function tollPlazas(booths: TollPlaza[]): TollPlaza[] {
  const plazas: TollPlaza[] = [];
  for (const b of [...booths].sort((x, y) => x.kmFromStart - y.kmFromStart)) {
    const last = plazas.at(-1);
    if (last && b.kmFromStart - last.kmFromStart < ONE_PLAZA_KM) {
      if (!last.name && b.name) last.name = b.name;
      continue;
    }
    plazas.push({ ...b });
  }
  return plazas;
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
  /** Toll plazas on the route (within 200 m), for cars; two-wheelers pay no NH tolls. */
  tolls: TollPlaza[];
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

export function summariseSafety(
  points: SafetyPoint[],
  totalKm: number,
  tolls: TollPlaza[] = [],
): SafetySummary {
  const counts = {} as Record<SafetyKind, number>;
  const perFiftyKm = {} as Record<SafetyKind, number>;
  const gaps = {} as Record<SafetyKind, Gap>;
  for (const kind of SAFETY_KINDS) {
    const kms = points.filter((p) => p.kind === kind).map((p) => p.kmFromStart);
    counts[kind] = kms.length;
    perFiftyKm[kind] = totalKm > 0 ? Math.round((kms.length / totalKm) * 500) / 10 : 0;
    gaps[kind] = longestGap(kms, totalKm);
  }
  return {
    totalKm,
    counts,
    perFiftyKm,
    longestGap: gaps,
    points: thinByStretch(points),
    tolls: tollPlazas(tolls),
  };
}

/** Body of POST /api/services/along. */
export const safetyRequestSchema = z
  .object({
    routeId: z.string().regex(ROUTE_ID_PATTERN).optional(),
    geometry: lineStringSchema.optional(),
  })
  .refine((b) => b.routeId || b.geometry, { message: "Send routeId or geometry" });

export interface Helpline {
  number: string;
  name: string;
  /** What it is for, in a few words. */
  what: string;
}

/**
 * Numbers to call from the road (docs/02, "Breaks, sunset stop, tolls and helplines"): 112
 * everywhere in India; 1033, NHAI's helpline, when the route uses national highways. With no
 * road mix (the routing engine gave no road numbers) 1033 is left out rather than guessed.
 */
export function helplines(nationalKm: number | null): Helpline[] {
  return [
    { number: "112", name: "Emergency", what: "police, fire and ambulance" },
    ...(nationalKm !== null && nationalKm > 0
      ? [
          {
            number: "1033",
            name: "Highway helpline",
            what: "accidents and breakdowns on national highways",
          },
        ]
      : []),
  ];
}

/** A tel: link for a phone number as mapped ("+91 8173 244 444" -> "tel:+918173244444"). */
export function telLink(phone: string): string | null {
  const digits = phone.replace(/[^\d+]/g, "");
  return digits.replace(/\D/g, "").length >= 3 ? `tel:${digits}` : null;
}
