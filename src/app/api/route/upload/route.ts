import { z } from "zod";
import { lineStringSchema, ROUTE_ID_PATTERN } from "@/lib/places";
import { getUploadedRoute, saveUploadedRoute } from "@/server/services/routeService";
import { allowRequest, REQUEST_LIMITS } from "@/server/services/writeLimit";

const uploadSchema = z.object({
  geometry: lineStringSchema,
  /** Riding time from the file's times; without them the ride is timed at 40 km/h. */
  durationS: z
    .number()
    .min(60)
    .max(14 * 86_400)
    .nullish(),
});

/**
 * POST { geometry, durationS? } -> { route: RouteOption }: a ride opened from a GPX, KML or TCX
 * file. The browser has already cut 500 m from each end; only the line is kept, in route_cache
 * for 7 days (docs/02, "Ride your GPX"). 20 per visitor an hour.
 */
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => undefined);
  const parsed = uploadSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid ride", issues: z.flattenError(parsed.error) },
      { status: 400 },
    );
  }
  try {
    if (!(await allowRequest(request, REQUEST_LIMITS.upload))) {
      return Response.json(
        { error: "Too many rides opened from here. Try again in an hour." },
        { status: 429, headers: { "Retry-After": "3600" } },
      );
    }
    const route = await saveUploadedRoute(parsed.data.geometry, parsed.data.durationS ?? null);
    return Response.json({ route });
  } catch (err) {
    console.error("POST /api/route/upload failed", err);
    return Response.json({ error: "Could not open the ride" }, { status: 500 });
  }
}

/** GET ?id=<route id> -> { route } for a reload or a shared link; 404 once it has expired. */
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!ROUTE_ID_PATTERN.test(id)) {
    return Response.json({ error: "Invalid route id" }, { status: 400 });
  }
  try {
    const route = await getUploadedRoute(id);
    if (!route) {
      return Response.json({ error: "Route not found", code: "ROUTE_NOT_FOUND" }, { status: 404 });
    }
    return Response.json({ route });
  } catch (err) {
    console.error("GET /api/route/upload failed", err);
    return Response.json({ error: "Could not open the ride" }, { status: 500 });
  }
}
