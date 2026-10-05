import { z } from "zod";
import { PLACE_LIST_CATEGORIES } from "@/lib/categories";

/**
 * What a rider's sentence asks for, as the model fills it in (structured outputs). Numbers carry
 * no bounds here (the output format does not support them); `cleanIntent` clamps them.
 */
export const tripIntentSchema = z.object({
  from: z.string().nullable(),
  to: z.string().nullable(),
  via: z.array(z.string()),
  vehicle: z.enum(["bike", "car"]).nullable(),
  categories: z.array(z.enum(PLACE_LIST_CATEGORIES as [string, ...string[]])),
  days: z.number().int().nullable(),
  maxOneWayKm: z.number().nullable(),
  month: z.number().int().nullable(),
});

export type TripIntent = z.infer<typeof tripIntentSchema>;

export interface TripIntentResult {
  intent: TripIntent;
  tokensIn: number;
  tokensOut: number;
}

export interface TripIntentProvider {
  /** The trip a sentence asks for, or null when the model could not (or would not) read one. */
  parseTrip(text: string): Promise<TripIntentResult | null>;
}

const clamp = (n: number | null, lo: number, hi: number) =>
  n === null || !Number.isFinite(n) ? null : Math.min(hi, Math.max(lo, Math.round(n)));
const tidy = (s: string | null) => {
  const t = s?.trim().slice(0, 80);
  return t ? t : null;
};

/** Trims names, drops empty ones, keeps at most 3 vias, and clamps days, distance and month. */
export function cleanIntent(intent: TripIntent): TripIntent {
  return {
    from: tidy(intent.from),
    to: tidy(intent.to),
    via: intent.via
      .map(tidy)
      .filter((v): v is string => v !== null)
      .slice(0, 3),
    vehicle: intent.vehicle,
    categories: [...new Set(intent.categories)].slice(0, 6),
    days: clamp(intent.days, 1, 14),
    maxOneWayKm: clamp(intent.maxOneWayKm, 10, 3000),
    month: clamp(intent.month, 1, 12),
  };
}
