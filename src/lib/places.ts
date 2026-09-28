import { z } from "zod";
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
