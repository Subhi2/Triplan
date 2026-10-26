import { z } from "zod";
import { tripRequestSchema } from "@/lib/trip";
import { ProviderError } from "@/server/providers/http";
import { NoRouteError } from "@/server/providers/routing";
import { ROUTE_ID_PATTERN } from "@/lib/places";
import { getRoutes, getUploadedRoute } from "@/server/services/routeService";
import { countLater } from "@/server/services/usage";
import { allowRequestOrOpen, REQUEST_LIMITS } from "@/server/services/writeLimit";

// Up to four routing requests (the trip, then towns for extra options), spaced 1 s apart for the
// public OSRM server: allow more than the platform's default time.
export const maxDuration = 60;

/** POST { stops: [{label, location: [lng, lat]}], vehicle } -> { routes: RouteOption[] } */
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => undefined);
  const parsed = tripRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid trip", issues: z.flattenError(parsed.error) },
      { status: 400 },
    );
  }

  if (!(await allowRequestOrOpen(request, REQUEST_LIMITS.route))) {
    return Response.json(
      { error: "Too many routes planned from here. Try again in an hour." },
      { status: 429, headers: { "Retry-After": "3600" } },
    );
  }

  try {
    const routes = await getRoutes(parsed.data);
    countLater("route_planned"); // for "rides planned" on About
    return Response.json({ routes });
  } catch (err) {
    if (err instanceof NoRouteError) {
      return Response.json({ error: err.message }, { status: 404 });
    }
    console.error("POST /api/route failed", err);
    const message =
      err instanceof ProviderError ? "The routing service is unavailable" : "Routing failed";
    return Response.json({ error: message }, { status: 502 });
  }
}

/**
 * GET ?id=<route id> -> { route }: one route from route_cache by its id (a ride-together room shows
 * the trip's route). 404 once it has expired (7 days).
 */
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
    console.error("GET /api/route failed", err);
    return Response.json({ error: "Could not load the route" }, { status: 500 });
  }
}
