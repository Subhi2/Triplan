import { z } from "zod";
import { routeAlertsRequestSchema } from "@/lib/alerts";
import { getAlertsProvider } from "@/server/providers/alerts";
import { alertsAlongRoute } from "@/server/services/alertsService";
import { getRouteGeometry } from "@/server/services/routeService";
import { allowRequestOrOpen, REQUEST_LIMITS } from "@/server/services/writeLimit";

// A cold cache reads a few feeds, up to 40 alert messages and 12 area files, 4 at a time.
export const maxDuration = 30;

/**
 * POST { routeId | geometry } -> RouteAlertsResponse
 * Official alerts (NDMA SACHET) whose areas the route enters (docs/02, "Alerts on the route").
 * routeId works like POST /api/places/along: 404 ROUTE_NOT_FOUND when it expired.
 */
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => undefined);
  const parsed = routeAlertsRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request", issues: z.flattenError(parsed.error) },
      { status: 400 },
    );
  }
  if (!(await allowRequestOrOpen(request, REQUEST_LIMITS.alerts))) {
    return Response.json(
      { error: "Too many alert checks from here. Try again in an hour." },
      { status: 429, headers: { "Retry-After": "3600" } },
    );
  }
  const { routeId, geometry } = parsed.data;

  try {
    const line = geometry ?? (routeId ? await getRouteGeometry(routeId) : null);
    if (!line) {
      return Response.json({ error: "Route not found", code: "ROUTE_NOT_FOUND" }, { status: 404 });
    }
    const result = await alertsAlongRoute(line, getAlertsProvider());
    // Feeds are re-read every 10 minutes on the server.
    return Response.json(result, { headers: { "Cache-Control": "private, max-age=300" } });
  } catch (err) {
    console.error("POST /api/route/alerts failed", err);
    return Response.json({ error: "Could not load alerts" }, { status: 502 });
  }
}
