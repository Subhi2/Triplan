import { z } from "zod";
import { routeTimeline } from "@/lib/multiDay";
import { routeRulesRequestSchema, type RouteRulesResponse } from "@/lib/roadRules";
import { rulesAlongRoute } from "@/server/services/roadRuleService";
import { getRouteResult } from "@/server/services/routeService";

/**
 * POST { routeId | geometry } -> RouteRulesResponse
 * The night bans, permits, e-passes and fees the route meets (docs/02, "Road rules and permits"),
 * with the route's timeline so the planner can check them against any start time without asking
 * again. routeId works like POST /api/places/along: 404 ROUTE_NOT_FOUND when it expired.
 */
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => undefined);
  const parsed = routeRulesRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request", issues: z.flattenError(parsed.error) },
      { status: 400 },
    );
  }
  const { routeId, geometry } = parsed.data;

  try {
    const result = routeId ? await getRouteResult(routeId) : null;
    const line = geometry ?? result?.geometry ?? null;
    if (!line) {
      return Response.json({ error: "Route not found", code: "ROUTE_NOT_FOUND" }, { status: 404 });
    }
    const response: RouteRulesResponse = {
      rules: await rulesAlongRoute(line),
      timeline: result
        ? routeTimeline(result.roads, result.distanceM / 1000, result.durationS / 60)
        : null,
    };
    // The rules change only when they are seeded again.
    return Response.json(response, { headers: { "Cache-Control": "private, max-age=3600" } });
  } catch (err) {
    console.error("POST /api/route/rules failed", err);
    return Response.json({ error: "Could not load the road rules" }, { status: 502 });
  }
}
