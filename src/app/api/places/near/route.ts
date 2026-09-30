import { z } from "zod";
import { nearbyQuerySchema } from "@/lib/nearby";
import { findNearby } from "@/server/services/nearbyService";

// One OSRM table request (6 s timeout, throttled to 1/s) after the database query.
export const maxDuration = 30;

// A position is personal: never cached by browsers or CDNs, never logged.
const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * GET ?lng&lat&within=30|60|120|240&vehicle=bike|car&categories=a,b&mode=reach|ride
 *   -> NearbyResponse { places: PlaceNear[], roadTimes: "osrm" | "straight", radiusKm }
 * The position is rounded to 3 decimals (~100 m) on the way in. Without categories it returns
 * the place-list categories (no fuel stations or towns).
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const parsed = nearbyQuerySchema.safeParse(Object.fromEntries(params));
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request", issues: z.flattenError(parsed.error) },
      { status: 400, headers: NO_STORE },
    );
  }

  try {
    return Response.json(await findNearby(parsed.data), { headers: NO_STORE });
  } catch (err) {
    // The message only: a database error object carries the query's parameters (the position).
    console.error("GET /api/places/near failed:", err instanceof Error ? err.message : "error");
    return Response.json({ error: "Could not load places" }, { status: 500, headers: NO_STORE });
  }
}
