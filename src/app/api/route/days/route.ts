import { z } from "zod";
import { daysRequestSchema } from "@/lib/multiDay";
import { planDays } from "@/server/services/dayPlanService";

/**
 * POST { routeId | geometry, distanceKm, durationMin; hoursPerDay; days? } -> DayPlan
 * The route split into days of riding, each night in a town with stays near it. Without `days`
 * the plan takes as many as the route needs at `hoursPerDay`. An expired route id is 404 with
 * code ROUTE_NOT_FOUND, and the client resends the geometry and the route's totals.
 */
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => undefined);
  const parsed = daysRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request", issues: z.flattenError(parsed.error) },
      { status: 400 },
    );
  }
  try {
    const plan = await planDays(parsed.data);
    if (!plan) {
      return Response.json({ error: "Route not found", code: "ROUTE_NOT_FOUND" }, { status: 404 });
    }
    return Response.json(plan);
  } catch (err) {
    console.error("POST /api/route/days failed", err);
    return Response.json({ error: "Could not split the route into days" }, { status: 500 });
  }
}
