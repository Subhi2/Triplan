import { z } from "zod";
import { tripIdSchema, updateTripSchema } from "@/lib/savedTrip";
import { getTrip, tripEditAccess, updateTrip } from "@/server/services/tripService";
import { allowWrite } from "@/server/services/writeLimit";

type Context = { params: Promise<{ id: string }> };

const notFound = () => Response.json({ error: "Trip not found" }, { status: 404 });
const tooMany = () =>
  Response.json(
    { error: "Too many trip changes from here. Try again in an hour." },
    { status: 429, headers: { "Retry-After": "3600" } },
  );
const notYours = (status: 401 | 403) =>
  Response.json(
    { error: "Only the device that saved this trip can change it. Save a copy instead." },
    { status },
  );

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

/**
 * PATCH { title?, plan? } with `Authorization: Bearer <edit token>` -> { trip: SavedTrip }.
 * 401 without a token, 403 with the wrong one or for a trip saved before edit tokens.
 */
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
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() || null : null;
  try {
    if (!(await allowWrite(request))) return tooMany();
    const access = await tripEditAccess(id.data, token);
    if (access === "not-found") return notFound();
    if (access === "no-token") return notYours(401);
    if (access !== "ok") return notYours(403);
    const trip = await updateTrip(id.data, parsed.data);
    return trip ? Response.json({ trip }) : notFound();
  } catch (err) {
    console.error("PATCH /api/trips/[id] failed", err);
    return Response.json({ error: "Could not update the trip" }, { status: 500 });
  }
}
