import { z } from "zod";
import type { LngLat } from "./geo";
import { nicknameSchema } from "./rideRoom";
import { lngLatSchema } from "./trip";

// Riders' reviews, photos and road reports without sign-in (docs/02, "Reviews, photos and road
// reports"): what a post may contain, how long a road report lasts, and how ratings are ranked.
// Shared by the forms and the API, which checks every post again.

export const REVIEW_BODY_MAX = 1000;
export const REPORT_NOTE_MAX = 280;
export const PHOTO_MAX_BYTES = 8 * 1024 * 1024;
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** Vehicles a reviewer may say they came by (the database's vehicle type). */
export const REVIEW_VEHICLES = ["bike", "car", "suv_4x4", "on_foot", "bus"] as const;

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n"));

export const reviewInputSchema = z
  .object({
    rating: z.number().int().min(1).max(5),
    body: text(REVIEW_BODY_MAX),
    nickname: nicknameSchema,
    visitedMonth: z.number().int().min(1).max(12).nullable(),
    visitedYear: z.number().int().min(2000).max(2100).nullable(),
    vehicleUsed: z.enum(REVIEW_VEHICLES).nullable(),
  })
  .refine((r) => r.visitedYear === null || r.visitedMonth !== null, {
    message: "A year needs a month",
    path: ["visitedMonth"],
  });
export type ReviewInput = z.infer<typeof reviewInputSchema>;

export const ROAD_REPORT_KINDS = [
  "closed",
  "landslide",
  "flooded",
  "potholes",
  "diversion",
] as const;
export type RoadReportKind = (typeof ROAD_REPORT_KINDS)[number];

export const ROAD_REPORT_LABELS: Record<RoadReportKind, string> = {
  closed: "Road closed",
  landslide: "Landslide",
  flooded: "Flooded",
  potholes: "Bad potholes",
  diversion: "Diversion",
};

/** Hours a report stays up: blockages last longer than potholes or a diversion. */
export const ROAD_REPORT_TTL_H: Record<RoadReportKind, number> = {
  closed: 72,
  landslide: 72,
  flooded: 72,
  potholes: 24,
  diversion: 24,
};

/** India and a margin: a report anywhere else is a mistake or a test. */
const INDIA_BOX = { west: 67, south: 6, east: 98, north: 38 };

export const roadReportInputSchema = z.object({
  kind: z.enum(ROAD_REPORT_KINDS),
  location: lngLatSchema.refine(
    ([lng, lat]) =>
      lng >= INDIA_BOX.west &&
      lng <= INDIA_BOX.east &&
      lat >= INDIA_BOX.south &&
      lat <= INDIA_BOX.north,
    { message: "Reports are for roads in India" },
  ),
  note: text(REPORT_NOTE_MAX),
  nickname: nicknameSchema.nullable(),
});
export type RoadReportInput = z.infer<typeof roadReportInputSchema>;

/** "Something's wrong here" on a place (G8): what the rider says is wrong. */
export const PLACE_FLAG_KINDS = [
  "closed",
  "wrong_location",
  "wrong_category",
  "duplicate",
  "other",
] as const;
export type PlaceFlagKind = (typeof PLACE_FLAG_KINDS)[number];

export const PLACE_FLAG_LABELS: Record<PlaceFlagKind, string> = {
  closed: "It is closed or gone",
  wrong_location: "It is in the wrong spot on the map",
  wrong_category: "It is the wrong kind of place",
  duplicate: "It is listed twice",
  other: "Something else",
};

export const placeFlagInputSchema = z
  .object({ kind: z.enum(PLACE_FLAG_KINDS), note: text(REPORT_NOTE_MAX) })
  .refine((f) => f.kind !== "other" || f.note.trim().length >= 3, {
    message: "Say what is wrong",
    path: ["note"],
  });
export type PlaceFlagInput = z.infer<typeof placeFlagInputSchema>;

/** A takedown request from /terms (G9): what is wrong with a page of ours. */
export const CONTENT_REPORT_KINDS = ["copyright", "privacy", "harmful", "wrong", "other"] as const;
export type ContentReportKind = (typeof CONTENT_REPORT_KINDS)[number];

export const CONTENT_REPORT_LABELS: Record<ContentReportKind, string> = {
  copyright: "It uses my photo or text without permission",
  privacy: "It shows a person or private details",
  harmful: "It is abusive, unsafe or illegal",
  wrong: "It is false or misleading",
  other: "Something else",
};

export const CONTENT_NOTE_MAX = 1000;
const CONTACT_MAX = 200;

/**
 * One of our own pages: a path, or a full link to this site reduced to its path. Never another
 * site's address, so the form cannot carry links to elsewhere.
 */
export function ownPath(input: string, siteOrigin: string): string | null {
  const s = input.trim();
  if (!s) return null;
  try {
    const url = new URL(s, siteOrigin);
    if (url.origin !== new URL(siteOrigin).origin) return null;
    const path = `${url.pathname}${url.search}`;
    return path.length <= 300 ? path : null;
  } catch {
    return null;
  }
}

export const contentReportInputSchema = z.object({
  path: z
    .string()
    .trim()
    .max(300)
    .regex(/^\/[^\s]*$/, "Paste the link to the page on this site"),
  kind: z.enum(CONTENT_REPORT_KINDS),
  note: z
    .string()
    .trim()
    .min(10, "Say what should come down and why")
    .max(CONTENT_NOTE_MAX)
    .transform((s) => s.replace(/\n{3,}/g, "\n\n")),
  contact: z
    .string()
    .trim()
    .max(CONTACT_MAX)
    .transform((s) => s || null)
    .nullable()
    .default(null),
});
export type ContentReportInput = z.infer<typeof contentReportInputSchema>;

/** An approved road report on a route (POST /api/route/reports). */
export interface RoadReportAlong {
  id: string;
  kind: RoadReportKind;
  note: string;
  nickname: string | null;
  location: LngLat;
  kmFromStart: number;
  detourKm: number;
  createdAt: string;
  expiresAt: string;
}

/** When a report of this kind made at `at` stops showing. */
export function reportExpiresAt(kind: RoadReportKind, at: Date): Date {
  return new Date(at.getTime() + ROAD_REPORT_TTL_H[kind] * 3_600_000);
}

/**
 * A rating for ranking (docs/02): a Bayesian average that starts every place at RATING_PRIOR as
 * if it had RATING_PRIOR_WEIGHT reviews, so one 5-star review does not top a place with fifty
 * 4-star ones. The plain average is still what the place shows.
 */
export const RATING_PRIOR = 3.5;
export const RATING_PRIOR_WEIGHT = 5;

export function rankingRating(average: number | null, count: number): number | null {
  if (average === null || count <= 0) return null;
  return (RATING_PRIOR * RATING_PRIOR_WEIGHT + average * count) / (RATING_PRIOR_WEIGHT + count);
}

/**
 * The device's key (256 random bits, base64url, kept in localStorage): sent with each post, it
 * lets the device change or delete what it posted. Only its hash is stored.
 */
export const deviceKeySchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
