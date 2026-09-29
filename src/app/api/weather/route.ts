import { z } from "zod";
import { weatherRequestSchema } from "@/lib/weather";
import { getWeatherProvider } from "@/server/providers/weather";
import { getRouteGeometry } from "@/server/services/routeService";
import { weatherAlong } from "@/server/services/weatherService";

/**
 * POST { routeId | geometry, departAt, rideMin } -> { points: WeatherPoint[] }
 * The forecast along the route at the time the rider gets to each point (docs/02, "Weather on
 * the ride"). routeId works like POST /api/places/along: 404 ROUTE_NOT_FOUND when it expired.
 */
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => undefined);
  const parsed = weatherRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request", issues: z.flattenError(parsed.error) },
      { status: 400 },
    );
  }
  const { routeId, geometry, departAt, rideMin } = parsed.data;

  try {
    const line = geometry ?? (routeId ? await getRouteGeometry(routeId) : null);
    if (!line) {
      return Response.json({ error: "Route not found", code: "ROUTE_NOT_FOUND" }, { status: 404 });
    }
    const points = await weatherAlong(line, new Date(departAt), rideMin, getWeatherProvider());
    return Response.json(
      { points },
      // Forecasts change every half hour or so.
      { headers: { "Cache-Control": "private, max-age=600" } },
    );
  } catch (err) {
    console.error("POST /api/weather failed", err);
    return Response.json({ error: "Could not load the weather" }, { status: 502 });
  }
}
