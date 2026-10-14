import { z } from "zod";
import { minAtKm, type Timeline } from "./multiDay";
import { lineStringSchema, ROUTE_ID_PATTERN } from "./places";
import { breakMinutes } from "./rideCheck";
import type { Vehicle } from "./trip";

// Road rules (docs/02, "Road rules and permits"): night bans, permits, e-passes and fees on the
// road, checked against when the rider gets there. Pure, shared by the seed script, the server
// and the planner.

export const RULE_KINDS = ["night_ban", "permit", "epass", "fee"] as const;
export type RuleKind = (typeof RULE_KINDS)[number];

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const lngLat = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);

/** Where a rule applies, as data/road-rules.json gives it. */
export const ruleWhereSchema = z.union([
  /** A stretch of road: routed between these points when seeded. */
  z.object({ road: z.array(lngLat).min(2).max(10) }),
  /** Districts by name in a state (OSM_REGIONS key), from our district outlines. */
  z.object({ districts: z.array(z.string().min(2)).min(1), state: z.string() }),
  /** A whole state, from its districts. */
  z.object({ state: z.string() }),
  /** Around points, for areas that are not districts (Kodaikanal's hills, Ladakh's valleys). */
  z.object({
    circles: z
      .array(z.object({ center: lngLat, radiusKm: z.number().positive().max(100) }))
      .min(1)
      .max(10),
  }),
]);
export type RuleWhere = z.infer<typeof ruleWhereSchema>;

export const roadRuleSourceSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9-]+$/),
    kind: z.enum(RULE_KINDS),
    title: z.string().min(5),
    where: ruleWhereSchema,
    /** Night bans: the hours closed, India time; "21:00" to "06:00" runs over midnight. */
    closed: z.object({ from: hhmm, to: hhmm }).optional(),
    /** Empty: every vehicle. */
    vehicles: z.array(z.enum(["bike", "car"])).default([]),
    /** Empty: all year. */
    months: z.array(z.number().int().min(1).max(12)).default([]),
    /** The authority's page where there is one, else the report it was checked against. */
    link: z.url(),
    /** Who says so, when the link is not the authority's own page ("Deccan Herald, April 2025"). */
    source: z.string().optional(),
    checkedOn: z.iso.date(),
    note: z.string().optional(),
  })
  .refine((r) => (r.kind === "night_ban") === Boolean(r.closed), {
    message: "Night bans, and only they, give closed hours",
  });
export type RoadRuleSource = z.infer<typeof roadRuleSourceSchema>;
export const roadRulesFileSchema = z.array(roadRuleSourceSchema);

/** A rule the route meets (rules_along_route), as the API sends it. */
export interface RuleOnRoute {
  slug: string;
  kind: RuleKind;
  title: string;
  /** Where the route meets the rule and where it leaves it. */
  kmFrom: number;
  kmTo: number;
  closedFrom: string | null;
  closedTo: string | null;
  vehicles: string[];
  months: number[];
  link: string;
  source: string | null;
  checkedOn: string;
  note: string | null;
}

export interface RouteRulesResponse {
  rules: RuleOnRoute[];
  /** The route's own timeline (km against riding minutes), when the server still has the route. */
  timeline: Timeline | null;
}

/** Body of POST /api/route/rules: a route id from POST /api/route, or the route's geometry. */
export const routeRulesRequestSchema = z
  .object({
    routeId: z.string().regex(ROUTE_ID_PATTERN).optional(),
    geometry: lineStringSchema.optional(),
  })
  .refine((b) => b.routeId || b.geometry, { message: "Send routeId or geometry" });

/** India Standard Time is UTC+5:30 all year; the rules are written in it. */
const IST_MS = 330 * 60_000;
const DAY_MS = 86_400_000;

const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h! * 60 + m!;
};

export interface RideTiming {
  departAt: Date;
  timeline: Timeline;
  /** With a multi-day split: each day's km. A day starts at the same time of day as the first. */
  days?: { fromKm: number; toKm: number }[];
}

/** When the rider reaches km: riding time along the timeline plus breaks, day by day. */
export function arrivalAt(km: number, { departAt, timeline, days }: RideTiming): Date {
  let day = 0;
  let startKm = 0;
  if (days && days.length > 1) {
    const i = days.findIndex((d) => km <= d.toKm);
    day = i < 0 ? days.length - 1 : i;
    startKm = days[day]!.fromKm;
  }
  const ride = minAtKm(timeline, km) - minAtKm(timeline, startKm);
  return new Date(departAt.getTime() + day * DAY_MS + (ride + breakMinutes(ride)) * 60_000);
}

/** The closed spells (start, end in ms) of a nightly ban on the days around an interval. */
export function closedSpells(from: string, to: string, start: Date, end: Date): [number, number][] {
  const f = minutesOf(from);
  const t = minutesOf(to);
  const length = ((t - f + 1440) % 1440 || 1440) * 60_000;
  const first = Math.floor((start.getTime() + IST_MS) / DAY_MS) - 1;
  const last = Math.floor((end.getTime() + IST_MS) / DAY_MS) + 1;
  const spells: [number, number][] = [];
  for (let day = first; day <= last; day++) {
    const begin = day * DAY_MS - IST_MS + f * 60_000;
    spells.push([begin, begin + length]);
  }
  return spells;
}

/** The month (1–12) in India at a time. */
export function indiaMonth(at: Date): number {
  return new Date(at.getTime() + IST_MS).getUTCMonth() + 1;
}

export type RuleVerdict =
  /** A night ban the rider reaches while it is closed. */
  | {
      state: "closed";
      enterAt: Date;
      exitAt: Date;
      /** The latest start that gets through before it closes. */
      leaveBy: Date;
      /** The earliest start that gets there after it opens. */
      leaveFrom: Date;
    }
  /**
   * A night ban the rider passes while it is open, and how many minutes before it next closes
   * they are through (a small margin is worth a warning: breaks run long).
   */
  | { state: "open"; enterAt: Date; minutesSpare: number }
  /** A permit, e-pass or fee. */
  | { state: "needs"; what: "permit" | "epass" | "fee"; enterAt: Date };

export interface RuleCheck {
  rule: RuleOnRoute;
  verdict: RuleVerdict;
}

/**
 * Each rule the ride meets, with what it means for this start time and vehicle. Rules for other
 * vehicles or other months are left out.
 */
export function checkRules(
  rules: RuleOnRoute[],
  vehicle: Vehicle,
  timing: RideTiming,
): RuleCheck[] {
  return rules.flatMap((rule): RuleCheck[] => {
    if (rule.vehicles.length > 0 && !rule.vehicles.includes(vehicle)) return [];
    const enterAt = arrivalAt(rule.kmFrom, timing);
    if (rule.months.length > 0 && !rule.months.includes(indiaMonth(enterAt))) return [];
    if (rule.kind !== "night_ban" || !rule.closedFrom || !rule.closedTo) {
      const what = rule.kind === "night_ban" ? "permit" : rule.kind;
      return [{ rule, verdict: { state: "needs", what, enterAt } }];
    }
    const exitAt = arrivalAt(rule.kmTo, timing);
    const spell = closedSpells(rule.closedFrom, rule.closedTo, enterAt, exitAt).find(
      ([begin, end]) => begin < exitAt.getTime() && end > enterAt.getTime(),
    );
    if (!spell) {
      const next = closedSpells(rule.closedFrom, rule.closedTo, exitAt, exitAt).find(
        ([begin]) => begin >= exitAt.getTime(),
      )!;
      const minutesSpare = Math.round((next[0] - exitAt.getTime()) / 60_000);
      return [{ rule, verdict: { state: "open", enterAt, minutesSpare } }];
    }
    const start = timing.departAt.getTime();
    return [
      {
        rule,
        verdict: {
          state: "closed",
          enterAt,
          exitAt,
          leaveBy: new Date(start - (exitAt.getTime() - spell[0])),
          leaveFrom: new Date(start + (spell[1] - enterAt.getTime())),
        },
      },
    ];
  });
}

/** Through with less time than this before a night ban closes: worth a warning. */
export const SPARE_WARN_MIN = 45;

/** "9 pm–6 am" from "21:00" and "06:00". */
export function closedHours(from: string, to: string): string {
  const fmt = (hhmm: string) => {
    const m = minutesOf(hhmm);
    const h = Math.floor(m / 60);
    const min = m % 60;
    const h12 = h % 12 || 12;
    return `${h12}${min ? `:${String(min).padStart(2, "0")}` : ""} ${h < 12 ? "am" : "pm"}`;
  };
  return `${fmt(from)}–${fmt(to)}`;
}
