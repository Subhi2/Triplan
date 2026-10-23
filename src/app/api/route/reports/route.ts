import { z } from "zod";
import { routeAlertsRequestSchema } from "@/lib/alerts";
import { reportsAlong } from "@/server/services/riderPostService";
import { getRouteGeometry } from "@/server/services/routeService";
import { allowRequestOrOpen, REQUEST_LIMITS } from "@/server/services/writeLimit";

/** Reports this close to the line count as on the route. */
const REPORT_CORRIDOR_M = 500;

/**
 * POST { routeId | geometry } -> { reports: RoadReportAlong[] }
 * Riders' road reports on the route, approved and not yet expired. routeId works like
 * POST /api/places/along: 404 ROUTE_NOT_FOUND when it expired.
 */
export async function POST(request: Request) {
  const parsed = routeAlertsRequestSchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request", issues: z.flattenError(parsed.error) },
      { status: 400 },
    );
  }
  if (!(await allowRequestOrOpen(request, REQUEST_LIMITS.reports))) {
    return Response.json(
      { error: "Too many requests from here. Try again in an hour." },
      { status: 429, headers: { "Retry-After": "3600" } },
    );
  }
  const { routeId, geometry } = parsed.data;
  try {
    const line = geometry ?? (routeId ? await getRouteGeometry(routeId) : null);
    if (!line) {
      return Response.json({ error: "Route not found", code: "ROUTE_NOT_FOUND" }, { status: 404 });
    }
    const reports = await reportsAlong(line, REPORT_CORRIDOR_M);
    return Response.json({ reports }, { headers: { "Cache-Control": "private, max-age=60" } });
  } catch (err) {
    console.error("POST /api/route/reports failed", err);
    return Response.json({ error: "Could not load road reports" }, { status: 500 });
  }
}
