import { z } from "zod";
import { CATEGORIES, isCategorySlug } from "./categories";
import type { LngLat } from "./geo";
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
  thumbUrl: string | null;
  trending: boolean;
  notable: boolean; // curated, reviewed or linked to Wikidata
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
  })
  .refine((b) => b.routeId || b.geometry, { message: "Send routeId or geometry" });

export type PlacesAlongRequest = z.infer<typeof placesAlongRequestSchema>;

export function detourLabel(detourKm: number): string {
  return detourKm <= ON_ROUTE_MAX_KM ? "On route" : `+${detourKm.toFixed(1)} km detour`;
}

/** The default list shows at most this many places per stretch of route. */
export const BEST_PER_STRETCH = 5;
export const STRETCH_KM = 10;

function rank(p: PlaceAlong): number {
  const weight = isCategorySlug(p.category) ? CATEGORIES[p.category].weight : 1;
  return weight + (p.notable ? 1 : 0) + (p.rating ?? 0) / 5;
}

/**
 * The default ("best stops") list: per 10 km of route, the 5 best places (category weight,
 * notable, rating, then the smallest detour). Cities have hundreds of mapped places; this keeps
 * the list readable on any trip. Picking a category shows every place in it instead.
 */
export function bestAlongRoute(places: PlaceAlong[]): PlaceAlong[] {
  const stretches = new Map<number, PlaceAlong[]>();
  for (const p of places) {
    const key = Math.floor(p.kmFromStart / STRETCH_KM);
    stretches.set(key, [...(stretches.get(key) ?? []), p]);
  }
  const kept = new Set<string>();
  for (const group of stretches.values()) {
    group
      .sort((a, b) => rank(b) - rank(a) || a.detourKm - b.detourKm)
      .slice(0, BEST_PER_STRETCH)
      .forEach((p) => kept.add(p.id));
  }
  return places.filter((p) => kept.has(p.id));
}
