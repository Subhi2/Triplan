import { z } from "zod";
import { createTripSchema, tripIdsSchema } from "@/lib/savedTrip";
import { createTrip, listTrips } from "@/server/services/tripService";
import { allowWrite } from "@/server/services/writeLimit";

// Saved trips need no sign-in. There is no list of everyone's trips: a device asks for the ids it
// saved or opened (docs/02, "Saved trips").

const tooMany = () =>
  Response.json(
    { error: "Too many trip changes from here. Try again in an hour." },
    { status: 429, headers: { "Retry-After": "3600" } },
  );

/** GET ?ids=a,b,c -> { trips: TripSummary[] }: those trips, most recently changed first. */
export async function GET(request: Request) {
  const ids = tripIdsSchema.safeParse(new URL(request.url).searchParams.get("ids") ?? "");
  if (!ids.success) {
    return Response.json({ error: "Invalid trip ids" }, { status: 400 });
  }
  try {
    return Response.json(
      { trips: await listTrips(ids.data) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (err) {
    console.error("GET /api/trips failed", err);
    return Response.json({ error: "Could not load trips" }, { status: 500 });
  }
}

/**
 * POST { title, stops, vehicle, corridorKm, route } -> 201 { trip: SavedTrip, editToken }.
 * The edit token is sent this once; the device keeps it to rename or change the trip.
 */
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => undefined);
  const parsed = createTripSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid trip", issues: z.flattenError(parsed.error) },
      { status: 400 },
    );
  }
  try {
    if (!(await allowWrite(request))) return tooMany();
    return Response.json(await createTrip(parsed.data), {
      status: 201,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    console.error("POST /api/trips failed", err);
    return Response.json({ error: "Could not save the trip" }, { status: 500 });
  }
}
