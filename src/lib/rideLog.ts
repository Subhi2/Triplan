import { z } from "zod";

// "My rides" (G11, C7): the rider's own log of rides, with famous rides they marked done, and
// totals by year. Numbers only, never a line or a position; private to the rider.

export const logEntrySchema = z.object({
  /** The day it was ridden (YYYY-MM-DD), not in the future. */
  riddenOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((d) => Date.parse(`${d}T00:00:00Z`) <= Date.now() + 36 * 3600 * 1000, {
      message: "That day has not come yet",
    }),
  title: z.string().trim().min(1).max(120),
  distanceKm: z.number().positive().max(10_000),
  hairpins: z.number().int().min(0).max(2_000).default(0),
  climbM: z.number().int().min(0).max(100_000).nullable().default(null),
  tripId: z.uuid().nullable().default(null),
});
export type LogEntryInput = z.infer<typeof logEntrySchema>;

/** One ride in "My rides": logged by the rider, or a famous ride marked done. */
export interface RideLogEntry {
  /** A log row's id, or "ride:<slug>" for a famous ride. */
  id: string;
  riddenOn: string;
  title: string;
  distanceKm: number;
  hairpins: number;
  climbM: number | null;
  /** The famous ride's page, when it is one. */
  rideSlug: string | null;
}

export interface YearTotals {
  year: number;
  rides: number;
  km: number;
  hairpins: number;
}

/** Totals by year, newest year first. */
export function totalsByYear(entries: RideLogEntry[]): YearTotals[] {
  const by = new Map<number, YearTotals>();
  for (const e of entries) {
    const year = Number(e.riddenOn.slice(0, 4));
    const t = by.get(year) ?? { year, rides: 0, km: 0, hairpins: 0 };
    t.rides += 1;
    t.km += e.distanceKm;
    t.hairpins += e.hairpins;
    by.set(year, t);
  }
  return [...by.values()]
    .map((t) => ({ ...t, km: Math.round(t.km) }))
    .sort((a, b) => b.year - a.year);
}

/** The year card's link (/og/year): numbers only, no nickname. */
export function yearCardPath(t: YearTotals): string {
  return `/og/year?y=${t.year}&r=${t.rides}&km=${t.km}&hp=${t.hairpins}`;
}
