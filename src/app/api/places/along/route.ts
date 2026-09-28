import { z } from "zod";
import { placesAlongRequestSchema } from "@/lib/places";
import { placesAlong, toPlaceAlong } from "@/server/services/corridorService";
import { getRouteGeometry } from "@/server/services/routeService";

/**
 * POST { routeId | geometry, corridorKm, categories? } -> { places: PlaceAlong[] }
 * routeId refers to a route from POST /api/route (held in route_cache for 7 days). If it has
 * expired the response is 404 with code ROUTE_NOT_FOUND, and the client resends the geometry.
 */
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => undefined);
  const parsed = placesAlongRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request", issues: z.flattenError(parsed.error) },
      { status: 400 },
    );
  }
  const { routeId, geometry, corridorKm, categories } = parsed.data;

  try {
    const line = geometry ?? (routeId ? await getRouteGeometry(routeId) : null);
    if (!line) {
      return Response.json({ error: "Route not found", code: "ROUTE_NOT_FOUND" }, { status: 404 });
    }
    const rows = await placesAlong(line, corridorKm * 1000, categories ?? null);
    return Response.json({ places: rows.map(toPlaceAlong) });
  } catch (err) {
    console.error("POST /api/places/along failed", err);
    return Response.json({ error: "Could not load places" }, { status: 500 });
  }
}
