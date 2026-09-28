import { z } from "zod";
import { round5 } from "@/lib/geo";
import { createThrottle, fetchJson, ProviderError } from "../http";
import { NoRouteError, type RouteInput, type RouteResult, type RoutingProvider } from "./types";

// The public demo server only has the car profile; bikes use it with a slower pace.
const BIKE_DURATION_FACTOR = 1.1;
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
    steps: "false",
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
  }));
}

// One throttle per process: the public demo server is for light use only.
const throttle = createThrottle(1_000);

export function createOsrmProvider(baseUrl: string): RoutingProvider {
  return {
    async route(input) {
      await throttle();
      const { data } = await fetchJson("osrm", buildOsrmRouteUrl(baseUrl, input), z.unknown());
      return parseOsrmResponse(data, input.profile);
    },
  };
}
