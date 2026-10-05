import { z } from "zod";
import { tripRequestSchema } from "@/lib/trip";
import { ProviderError } from "@/server/providers/http";
import { NoRouteError } from "@/server/providers/routing";
import { getRoutes } from "@/server/services/routeService";
import { countLater } from "@/server/services/usage";

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
