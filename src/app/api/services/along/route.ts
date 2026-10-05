import { z } from "zod";
import { haversineM, type LngLat } from "@/lib/geo";
import {
  SAFETY_CORRIDOR_KM,
  SAFETY_KINDS,
  safetyRequestSchema,
  summariseSafety,
  type SafetyPoint,
} from "@/lib/safety";
import { getRouteGeometry } from "@/server/services/routeService";
import { servicesAlong } from "@/server/services/servicePointService";

/**
 * POST { routeId | geometry } -> SafetySummary
 * Hospitals, police, ATMs, puncture and repair shops within 3 km of the route: counts, how many
 * per 50 km, the longest stretch without each, and the nearest few per 10 km to list and pin.
 * routeId refers to a route from POST /api/route; 404 ROUTE_NOT_FOUND once it has expired.
 */
export async function POST(request: Request) {
  const parsed = safetyRequestSchema.safeParse(await request.json().catch(() => undefined));
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
    const coords = line.coordinates as LngLat[];
    let lengthM = 0;
    for (let i = 1; i < coords.length; i++) lengthM += haversineM(coords[i - 1]!, coords[i]!);
    const rows = await servicesAlong(line, SAFETY_CORRIDOR_KM * 1000, [...SAFETY_KINDS]);
    const points: SafetyPoint[] = rows.map((r) => ({
      id: r.osmId,
      kind: r.kind as SafetyPoint["kind"],
      name: r.name,
      phone: r.phone,
      location: r.location,
      kmFromStart: Math.round(r.kmFromStart * 10) / 10,
      detourKm: Math.round(r.detourM / 100) / 10,
    }));
    return Response.json(summariseSafety(points, lengthM / 1000));
  } catch (err) {
    console.error("POST /api/services/along failed", err);
    return Response.json({ error: "Could not load safety stops" }, { status: 500 });
  }
}
