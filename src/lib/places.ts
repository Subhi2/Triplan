import { z } from "zod";
import { CATEGORIES, isCategorySlug } from "./categories";
import type { LngLat } from "./geo";
import { rankingRating } from "./riderPosts";
import { CORRIDOR_KM, lngLatSchema } from "./trip";

/** A place within the corridor of a route (POST /api/places/along). */
export interface PlaceAlong {
  id: string;
  slug: string;
  name: string;
  category: string;
  location: LngLat;
  kmFromStart: number;
  detourKm: number; // approximate (straight line), one way
  rating: number | null;
  ratingCount: number;
  bestMonths: number[];
  /** The months are estimated from the category and climate (src/lib/guideDefaults.ts). */
  bestMonthsEstimated: boolean;
  thumbUrl: string | null;
  trending: boolean;
  notable: boolean; // curated, reviewed or linked to Wikidata
  /** Fuel, food or coffee from Overture (open_place): no page of its own. */
  open?: true;
}

/** Places this close to the route line count as "On route". */
export const ON_ROUTE_MAX_KM = 0.5;
/** trending_score at or above this shows a "Trending" badge (see docs/05). */
export const TRENDING_MIN_SCORE = 3;
export const DETOUR_LIMITS_KM = [1, 2, 5] as const;

/** Route ids are the route cache hash plus the route's index in that response. */
export const ROUTE_ID_PATTERN = /^[0-9a-f]{32}-[0-2]$/;

export const lineStringSchema = z.object({
  type: z.literal("LineString"),
  coordinates: z.array(lngLatSchema).min(2).max(50_000),
});

export const placesAlongRequestSchema = z
  .object({
    routeId: z.string().regex(ROUTE_ID_PATTERN).optional(),
    geometry: lineStringSchema.optional(),
    corridorKm: z.literal(CORRIDOR_KM),
    categories: z
      .array(z.string().regex(/^[a-z0-9_]+$/))
      .min(1)
      .max(20)
      .optional(),
    /** Also open places (fuel, food, coffee from Overture) in `categories`: breaks, fuel gap. */
    openPlaces: z.boolean().optional(),
  })
  .refine((b) => b.routeId || b.geometry, { message: "Send routeId or geometry" });

export type PlacesAlongRequest = z.infer<typeof placesAlongRequestSchema>;

export function detourLabel(detourKm: number): string {
  return detourKm <= ON_ROUTE_MAX_KM ? "On route" : `+${detourKm.toFixed(1)} km detour`;
}

/** The default list shows at most this many places per stretch of route. */
export const BEST_PER_STRETCH = 5;
export const STRETCH_KM = 10;

/**
 * How worth stopping a place is: category weight, notable, rating. The rating is the Bayesian
 * one (src/lib/riderPosts.ts), so a single 5-star review does not lift a place to the top.
 */
export function placeRank(p: PlaceAlong): number {
  const weight = isCategorySlug(p.category) ? CATEGORIES[p.category].weight : 1;
  return weight + (p.notable ? 1 : 0) + (rankingRating(p.rating, p.ratingCount) ?? 0) / 5;
}

/** Popular ↔ Offbeat on the default list: the well-known stops, all of them, or the lesser-known. */
export const LIST_MIXES = ["popular", "mixed", "offbeat"] as const;
export type ListMix = (typeof LIST_MIXES)[number];

/** How well known a place is, 0–3: notable, has a photo, reviews, trending. */
export function popularity(p: PlaceAlong): number {
  return (
    (p.notable ? 1 : 0) +
    (p.thumbUrl ? 0.5 : 0) +
    Math.min(1, p.ratingCount / 20) +
    (p.trending ? 0.5 : 0)
  );
}

/** A place this popular or more counts as well known: notable, or a photo and reviews. */
export const WELL_KNOWN = 1;

/** Whether a place belongs in a list mix: Popular keeps the well known, Offbeat the rest. */
export function inMix(p: PlaceAlong, mix: ListMix): boolean {
  if (mix === "mixed") return true;
  return mix === "popular" ? popularity(p) >= WELL_KNOWN : popularity(p) < WELL_KNOWN;
}

/**
 * The rank a list mix sorts by inside a stretch. Mixed is `placeRank`. Popular puts the best
 * known first (category weight and rating plus popularity). Offbeat's places are all little
 * known, so category weight and rating decide (popularity-bias re-ranking toward the long tail,
 * docs/07 "Research behind G5").
 */
export function mixRank(p: PlaceAlong, mix: ListMix): number {
  if (mix === "mixed") return placeRank(p);
  const weight = isCategorySlug(p.category) ? CATEGORIES[p.category].weight : 1;
  const base = weight + (p.rating ?? 0) / 5;
  return mix === "popular" ? base + popularity(p) : base;
}

/**
 * The default ("best stops") list: per 10 km of route, the 5 best places (by the list mix, then
 * the smallest detour; Mixed ranks by category weight, notable and rating). Cities have hundreds
 * of mapped places; this keeps the list readable on any trip. Popular keeps only well-known
 * places and Offbeat only the others. Picking a category shows every place in it instead.
 */
export function bestAlongRoute(places: PlaceAlong[], mix: ListMix = "mixed"): PlaceAlong[] {
  const stretches = new Map<number, PlaceAlong[]>();
  for (const p of places) {
    if (!inMix(p, mix)) continue;
    const key = Math.floor(p.kmFromStart / STRETCH_KM);
    stretches.set(key, [...(stretches.get(key) ?? []), p]);
  }
  const kept = new Set<string>();
  for (const group of stretches.values()) {
    group
      .sort((a, b) => mixRank(b, mix) - mixRank(a, mix) || a.detourKm - b.detourKm)
      .slice(0, BEST_PER_STRETCH)
      .forEach((p) => kept.add(p.id));
  }
  return places.filter((p) => kept.has(p.id));
}
