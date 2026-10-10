import { z } from "zod";
import { round5 } from "@/lib/geo";
import { createThrottle, fetchJson, ProviderError } from "../http";
import {
  MAX_TABLE_DESTINATIONS,
  NoRouteError,
  type RoadStretch,
  type RouteInput,
  type RouteResult,
  type RoutingProvider,
  type RoutingTableProvider,
  type TableCell,
  type TableInput,
} from "./types";

// The public demo server only has the car profile; bikes use it with a slower pace.
export const BIKE_DURATION_FACTOR = 1.1;
// Up to 3 routes in total. OSRM only returns alternatives for exactly two waypoints.
const MAX_ALTERNATIVES = 2;

const osrmResponseSchema = z.object({
  code: z.string(),
  message: z.string().optional(),
  routes: z
    .array(
      z.object({
        geometry: z.object({
          type: z.literal("LineString"),
          coordinates: z.array(z.tuple([z.number(), z.number()])).min(2),
        }),
        distance: z.number().nonnegative(),
        duration: z.number().nonnegative(),
        legs: z.array(
          z.object({
            distance: z.number().nonnegative(),
            duration: z.number().nonnegative(),
            summary: z.string(),
            // One step per road stretch; `ref` is the road number ("NH75", "SH 57") when mapped.
            steps: z
              .array(
                z.object({
                  distance: z.number().nonnegative(),
                  duration: z.number().nonnegative().default(0),
                  ref: z.string().optional(),
                }),
              )
              .default([]),
          }),
        ),
      }),
    )
    .optional(),
});

export type OsrmResponse = z.infer<typeof osrmResponseSchema>;

export function buildOsrmRouteUrl(baseUrl: string, input: RouteInput): string {
  const coords = input.waypoints.map(([lng, lat]) => `${round5(lng)},${round5(lat)}`).join(";");
  const alternatives =
    input.alternatives && input.waypoints.length === 2 ? MAX_ALTERNATIVES : false;
  const params = new URLSearchParams({
    overview: "full",
    geometries: "geojson",
    alternatives: String(alternatives),
    steps: "true", // for road numbers (national / state highway mix)
  });
  return `${baseUrl.replace(/\/$/, "")}/route/v1/driving/${coords}?${params}`;
}

/** Validates a raw OSRM /route response and converts it to RouteResults. */
export function parseOsrmResponse(body: unknown, profile: RouteInput["profile"]): RouteResult[] {
  const parsed = osrmResponseSchema.safeParse(body);
  if (!parsed.success) throw new ProviderError("OSRM returned an unexpected response", "osrm");
  const { code, message, routes } = parsed.data;

  if (code === "NoRoute" || code === "NoSegment") throw new NoRouteError();
  if (code !== "Ok" || !routes?.length) {
    throw new ProviderError(`OSRM error ${code}${message ? `: ${message}` : ""}`, "osrm");
  }

  const factor = profile === "bike" ? BIKE_DURATION_FACTOR : 1;
  return routes.map((r) => ({
    geometry: r.geometry,
    distanceM: r.distance,
    durationS: r.duration * factor,
    legs: r.legs.map((l) => ({
      distanceM: l.distance,
      durationS: l.duration * factor,
      summary: l.summary,
    })),
    roads: mergeRoads(r.legs.flatMap((l) => l.steps), factor),
  }));
}

/**
 * Road stretches in route order, with consecutive steps on the same road number merged. Their
 * times give the multi-day split a km-to-hours timeline (slow ghats, fast expressways).
 */
function mergeRoads(
  steps: { distance: number; duration: number; ref?: string }[],
  factor: number,
): RoadStretch[] {
  const roads: RoadStretch[] = [];
  for (const step of steps) {
    const ref = step.ref?.trim() || null;
    const last = roads.at(-1);
    if (last && last.ref === ref) {
      last.distanceM += step.distance;
      last.durationS! += step.duration * factor;
    } else if (step.distance > 0) {
      roads.push({ distanceM: step.distance, durationS: step.duration * factor, ref });
    }
  }
  return roads;
}

const osrmTableSchema = z.object({
  code: z.string(),
  message: z.string().optional(),
  durations: z.array(z.array(z.number().nonnegative().nullable())).optional(),
  distances: z.array(z.array(z.number().nonnegative().nullable())).optional(),
});

/** One source (the origin, index 0) to every destination: /table/v1/driving/{o;d1;...}. */
export function buildOsrmTableUrl(baseUrl: string, input: TableInput): string {
  const coords = [input.origin, ...input.destinations]
    .map(([lng, lat]) => `${round5(lng)},${round5(lat)}`)
    .join(";");
  const params = new URLSearchParams({ sources: "0", annotations: "duration,distance" });
  return `${baseUrl.replace(/\/$/, "")}/table/v1/driving/${coords}?${params}`;
}

/**
 * Validates a raw OSRM /table response for `count` destinations and returns one cell per
 * destination (the origin's own column dropped). null: no road to that destination.
 */
export function parseOsrmTableResponse(
  body: unknown,
  count: number,
  profile: TableInput["profile"],
): (TableCell | null)[] {
  const parsed = osrmTableSchema.safeParse(body);
  if (!parsed.success) throw new ProviderError("OSRM returned an unexpected response", "osrm");
  const { code, message, durations, distances } = parsed.data;
  if (code !== "Ok") {
    throw new ProviderError(`OSRM error ${code}${message ? `: ${message}` : ""}`, "osrm");
  }
  const times = durations?.[0];
  const lengths = distances?.[0];
  if (!times || !lengths || times.length !== count + 1 || lengths.length !== count + 1) {
    throw new ProviderError("OSRM table has the wrong size", "osrm");
  }
  const factor = profile === "bike" ? BIKE_DURATION_FACTOR : 1;
  return times.slice(1).map((t, i) => {
    const d = lengths[i + 1];
    return t === null || d === null || d === undefined
      ? null
      : { distanceM: d, durationS: t * factor };
  });
}

// One throttle per process for routes and tables: the public demo server is for light use only.
// A queue over 20 s fails fast: /api/route makes up to four requests within its 60 s.
const throttle = createThrottle(1_000, Date.now, 20_000);

/** Short, so the Near me screen soon gets an answer or its straight-line fallback. */
const TABLE_TIMEOUT_MS = 6_000;

export function createOsrmProvider(baseUrl: string): RoutingProvider {
  return {
    async route(input) {
      await throttle();
      const { data } = await fetchJson("osrm", buildOsrmRouteUrl(baseUrl, input), z.unknown());
      return parseOsrmResponse(data, input.profile);
    },
  };
}

export function createOsrmTableProvider(baseUrl: string): RoutingTableProvider {
  return {
    async table(input) {
      if (input.destinations.length === 0) return [];
      if (input.destinations.length > MAX_TABLE_DESTINATIONS) {
        throw new ProviderError(
          `OSRM table takes at most ${MAX_TABLE_DESTINATIONS} destinations`,
          "osrm",
        );
      }
      await throttle();
      const url = buildOsrmTableUrl(baseUrl, input);
      const { data } = await fetchJson("osrm", url, z.unknown(), {}, TABLE_TIMEOUT_MS);
      return parseOsrmTableResponse(data, input.destinations.length, input.profile);
    },
  };
}
