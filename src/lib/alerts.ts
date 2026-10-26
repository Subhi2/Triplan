import { z } from "zod";
import { haversineM, resampleLine, type LngLat } from "./geo";
import { lineStringSchema, ROUTE_ID_PATTERN } from "./places";
import { breakMinutes } from "./rideCheck";

// Official alerts on the route (docs/02, "Alerts on the route"): CAP alerts from NDMA's SACHET
// whose area the route crosses. Pure helpers, shared by the server and the planner.

export const ALERT_SEVERITIES = ["Extreme", "Severe", "Moderate", "Minor", "Unknown"] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

export interface RouteAlert {
  /** The CAP identifier. */
  id: string;
  /** "Thunderstorm with Lightning", "Heavy Rain". */
  event: string;
  headline: string;
  severity: AlertSeverity;
  urgency: string;
  certainty: string;
  /** Who issued it: "IMD Bengaluru", "Karnataka SDMA", "CWC". */
  issuer: string;
  /** The area as the issuer describes it: "5 districts of Karnataka". */
  area: string;
  onset: string | null;
  expires: string;
  /** Where the route first enters the alert's area. */
  kmFromStart: number;
  /** The CAP message, for the full text. */
  url: string;
}

export interface RouteAlertsResponse {
  alerts: RouteAlert[];
  /** Some alerts in the route's states could not be checked this time (read again later). */
  partial: boolean;
}

/** Body of POST /api/route/alerts: a route id from POST /api/route, or the route's geometry. */
export const routeAlertsRequestSchema = z
  .object({
    routeId: z.string().regex(ROUTE_ID_PATTERN).optional(),
    geometry: lineStringSchema.optional(),
  })
  .refine((b) => b.routeId || b.geometry, { message: "Send routeId or geometry" });

/** The route is checked against alert areas at points this far apart. */
export const ALERT_SAMPLE_M = 500;

export interface RouteSample {
  point: LngLat;
  km: number;
}

/** Points every `stepM` along the route with their km, the destination included. */
export function routeSamples(coords: LngLat[], stepM = ALERT_SAMPLE_M): RouteSample[] {
  const samples = resampleLine(coords, stepM).map((point, i) => ({
    point,
    km: (i * stepM) / 1000,
  }));
  const end = coords.at(-1);
  const last = samples.at(-1);
  if (end && last && haversineM(end, last.point) > 1) {
    samples.push({ point: end, km: last.km + haversineM(last.point, end) / 1000 });
  }
  return samples;
}

/** Even-odd rule: whether a point lies inside a ring of [lng, lat] (closed or not). */
export function pointInRing([x, y]: LngLat, ring: LngLat[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

type Box = [number, number, number, number];

function ringBox(ring: LngLat[]): Box {
  const box: Box = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of ring) {
    if (x < box[0]) box[0] = x;
    if (y < box[1]) box[1] = y;
    if (x > box[2]) box[2] = x;
    if (y > box[3]) box[3] = y;
  }
  return box;
}

/**
 * The first km at which the route is inside any of the rings (each ring one area, such as a
 * district), or null when it never is.
 */
export function firstKmInside(samples: RouteSample[], rings: LngLat[][]): number | null {
  const areas = rings.filter((r) => r.length >= 3).map((ring) => ({ ring, box: ringBox(ring) }));
  for (const { point, km } of samples) {
    const [x, y] = point;
    for (const { ring, box } of areas) {
      if (x < box[0] || x > box[2] || y < box[1] || y > box[3]) continue;
      if (pointInRing(point, ring)) return km;
    }
  }
  return null;
}

/** Lower is worse: Extreme 0 … Unknown 4. */
export function severityRank(severity: AlertSeverity): number {
  return ALERT_SEVERITIES.indexOf(severity);
}

/** Worst first, then the one met first along the route. */
export function sortAlerts(alerts: RouteAlert[]): RouteAlert[] {
  return [...alerts].sort(
    (a, b) => severityRank(a.severity) - severityRank(b.severity) || a.kmFromStart - b.kmFromStart,
  );
}

/**
 * The alerts in force while the rider is on the road: from the start time to the arrival (riding
 * time plus breaks). Area alerts cover whole districts, so the whole ride counts, not the moment
 * the route enters the area. Without a start time, every current alert.
 */
export function alertsForRide(
  alerts: RouteAlert[],
  departAt: Date | null,
  rideMin: number,
): RouteAlert[] {
  if (!departAt) return alerts;
  const start = departAt.getTime();
  const end = start + (rideMin + breakMinutes(rideMin)) * 60_000;
  return alerts.filter(
    (a) => Date.parse(a.expires) > start && (a.onset === null || Date.parse(a.onset) < end),
  );
}

const until = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  hour: "numeric",
  minute: "2-digit",
});

/** "Thunderstorm with Lightning · from km 182 · until Thu 7:35 pm · IMD Bengaluru" */
export function alertLine(a: RouteAlert, format: Intl.DateTimeFormat = until): string {
  return [
    a.event,
    a.kmFromStart >= 1 ? `from km ${Math.round(a.kmFromStart)}` : "from the start",
    `until ${format.format(new Date(a.expires))}`,
    a.issuer,
  ].join(" · ");
}

/**
 * How loudly to show an alert. Not IMD's colour codes: CAP's severity is the issuer's own call
 * (Andhra Pradesh marks every lightning nowcast "Severe"), so the words stay CAP's.
 */
export function alertTone(severity: AlertSeverity): "bad" | "warn" | "muted" {
  return severity === "Extreme" || severity === "Severe"
    ? "bad"
    : severity === "Moderate"
      ? "warn"
      : "muted";
}
