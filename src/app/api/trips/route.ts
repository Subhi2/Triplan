import { z } from "zod";
import { createTripSchema } from "@/lib/savedTrip";
import { createTrip, listTrips } from "@/server/services/tripService";
import { allowWrite } from "@/server/services/writeLimit";

// Saved trips are open: no sign-in, one shared list (see docs/02, "Saved trips").

const tooMany = () =>
  Response.json(
    { error: "Too many trip changes from here. Try again in an hour." },
    { status: 429, headers: { "Retry-After": "3600" } },
  );

/** GET -> { trips: TripSummary[] }, most recently changed first. */
export async function GET() {
  try {
    return Response.json({ trips: await listTrips() });
  } catch (err) {
    console.error("GET /api/trips failed", err);
    return Response.json({ error: "Could not load trips" }, { status: 500 });
  }
}

/** POST { title, stops, vehicle, corridorKm, route } -> 201 { trip: SavedTrip } */
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
    return Response.json({ trip: await createTrip(parsed.data) }, { status: 201 });
  } catch (err) {
    console.error("POST /api/trips failed", err);
    return Response.json({ error: "Could not save the trip" }, { status: 500 });
  }
}
