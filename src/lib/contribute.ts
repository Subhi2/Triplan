import { z } from "zod";
import { PLACE_LIST_CATEGORIES, type CategorySlug } from "./categories";
import type { LngLat } from "./geo";

// "Add a place" (G11, A9; Phase 5 steps 3–4): a rider pins a place we do not have. It waits for
// an admin, like reviews, and shows on routes only once approved.

/** India, with a margin: a pin outside it is a mistake. */
const LNG = { min: 68, max: 97.5 };
const LAT = { min: 6.5, max: 36 };

/** Hosts a pasted video or post link may come from; kept as a plain link, never fetched. */
const LINK_HOSTS = ["youtube.com", "youtu.be", "instagram.com"];

export function allowedLink(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^(www|m)\./, "");
    return u.protocol === "https:" && LINK_HOSTS.includes(host);
  } catch {
    return false;
  }
}

export const NEW_PLACE_NOTE_MAX = 600;

export const newPlaceSchema = z.object({
  name: z.string().trim().min(2, "Name the place").max(120),
  category: z.enum(PLACE_LIST_CATEGORIES as [CategorySlug, ...CategorySlug[]]),
  location: z.tuple([z.number().min(LNG.min).max(LNG.max), z.number().min(LAT.min).max(LAT.max)]),
  bestMonths: z
    .array(z.number().int().min(1).max(12))
    .max(12)
    .default([])
    .transform((m) => [...new Set(m)].sort((a, b) => a - b)),
  note: z.string().trim().max(NEW_PLACE_NOTE_MAX).default(""),
  link: z
    .string()
    .trim()
    .max(300)
    .default("")
    .refine((l) => l === "" || allowedLink(l), "Only a YouTube or Instagram link"),
});
export type NewPlaceInput = z.infer<typeof newPlaceSchema>;

/** A place we have already, near the pin and with a similar name: "Is it one of these?" */
export interface SimilarPlace {
  slug: string;
  name: string;
  category: string;
  distanceM: number;
}

/** A new place waiting for an admin. */
export interface PendingPlace {
  id: string;
  slug: string;
  name: string;
  category: string;
  location: LngLat;
  bestMonths: number[];
  note: string | null;
  link: string | null;
  createdAt: string;
}
