import { z } from "zod";
import { tripRequestSchema } from "@/lib/trip";
import { ProviderError } from "@/server/providers/http";
import { NoRouteError } from "@/server/providers/routing";
import { getRoutes } from "@/server/services/routeService";

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
    return Response.json({ routes: await getRoutes(parsed.data) });
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
