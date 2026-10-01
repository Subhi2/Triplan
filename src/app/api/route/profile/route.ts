import { z } from "zod";
import { profileRequestSchema } from "@/lib/elevation";
import { routeProfile } from "@/server/services/elevationService";
import { getRouteGeometry } from "@/server/services/routeService";

// Up to ~160 terrain tiles on a cold server, six at a time.
export const maxDuration = 30;

/**
 * POST { routeId | geometry } -> { profile: ElevationProfile | null }
 * routeId refers to a route from POST /api/route (held in route_cache for 7 days). If it has
 * expired the response is 404 with code ROUTE_NOT_FOUND, and the client resends the geometry.
 * The profile is null when the terrain tiles could not be read; profiles are cached 7 days.
 */
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => undefined);
  const parsed = profileRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request", issues: z.flattenError(parsed.error) },
      { status: 400 },
    );
  }
  const { routeId, geometry } = parsed.data;

  try {
    const line = geometry ?? (routeId ? await getRouteGeometry(routeId) : null);
    if (!line) {
      return Response.json({ error: "Route not found", code: "ROUTE_NOT_FOUND" }, { status: 404 });
    }
    const profile = await routeProfile(line, geometry ? null : (routeId ?? null));
    return Response.json({ profile });
  } catch (err) {
    console.error("POST /api/route/profile failed", err);
    return Response.json({ error: "Could not load the elevation profile" }, { status: 500 });
  }
}
