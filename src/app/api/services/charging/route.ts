import { z } from "zod";
import { safetyRequestSchema } from "@/lib/safety";
import { FUEL_CORRIDOR_KM, type FuelStation } from "@/lib/rideCheck";
import { getRouteGeometry } from "@/server/services/routeService";
import { servicesAlong } from "@/server/services/servicePointService";

/**
 * POST { routeId | geometry } -> { points: FuelStation[] }
 * EV charging points within 2 km of the route (OpenStreetMap amenity=charging_station), in km
 * order, for the ride check of an electric bike or car (G10). routeId refers to a route from
 * POST /api/route; 404 ROUTE_NOT_FOUND once it has expired.
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
    const rows = await servicesAlong(line, FUEL_CORRIDOR_KM * 1000, ["charging"]);
    const points: FuelStation[] = rows.map((r) => ({
      name: r.name ?? "Charging point",
      kmFromStart: Math.round(r.kmFromStart * 10) / 10,
    }));
    return Response.json({ points });
  } catch (err) {
    console.error("POST /api/services/charging failed", err);
    return Response.json({ error: "Could not load charging points" }, { status: 500 });
  }
}
