import { z } from "zod";
import { tripIdSchema, updateTripSchema } from "@/lib/savedTrip";
import { getTrip, updateTrip } from "@/server/services/tripService";

type Context = { params: Promise<{ id: string }> };

const notFound = () => Response.json({ error: "Trip not found" }, { status: 404 });

/** GET -> { trip: SavedTrip } */
export async function GET(_request: Request, { params }: Context) {
  const id = tripIdSchema.safeParse((await params).id);
  if (!id.success) return notFound();
  try {
    const trip = await getTrip(id.data);
    return trip ? Response.json({ trip }) : notFound();
  } catch (err) {
    console.error("GET /api/trips/[id] failed", err);
    return Response.json({ error: "Could not load the trip" }, { status: 500 });
  }
}

/** PATCH { title?, plan? } -> { trip: SavedTrip }. Anyone with the link may update a trip. */
export async function PATCH(request: Request, { params }: Context) {
  const id = tripIdSchema.safeParse((await params).id);
  if (!id.success) return notFound();
  const body: unknown = await request.json().catch(() => undefined);
  const parsed = updateTripSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid update", issues: z.flattenError(parsed.error) },
      { status: 400 },
    );
  }
  try {
    const trip = await updateTrip(id.data, parsed.data);
    return trip ? Response.json({ trip }) : notFound();
  } catch (err) {
    console.error("PATCH /api/trips/[id] failed", err);
    return Response.json({ error: "Could not update the trip" }, { status: 500 });
  }
}
