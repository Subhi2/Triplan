import { z } from "zod";
import { newPlaceSchema } from "@/lib/contribute";
import { deviceKeySchema } from "@/lib/riderPosts";
import { createPlace, similarPlaces } from "@/server/services/contributeService";
import { gatePost } from "@/server/services/postGate";
import { powPayloadSchema } from "@/server/services/proofOfWork";

const postSchema = z.object({
  place: newPlaceSchema,
  pow: powPayloadSchema,
  deviceKey: deviceKeySchema,
});

const similarSchema = z.object({
  name: z.string().trim().min(2).max(120),
  lng: z.coerce.number().min(-180).max(180),
  lat: z.coerce.number().min(-90).max(90),
});

/**
 * GET ?name&lng&lat -> { similar: SimilarPlace[] }
 * Places we have within 1 km of the pin with a similar name (G11): asked before a rider adds one.
 */
export async function GET(request: Request) {
  const parsed = similarSchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  try {
    const { name, lng, lat } = parsed.data;
    return Response.json({ similar: await similarPlaces(name, [lng, lat]) });
  } catch (err) {
    console.error("GET /api/places/contribute failed", err);
    return Response.json({ similar: [] });
  }
}

/**
 * POST { place, pow, deviceKey } -> 201 { status: "pending" }
 * "Add a place" (G11): behind the same proof of work and limits as riders' posts; the place
 * waits for an admin and shows on routes only once approved.
 */
export async function POST(request: Request) {
  const parsed = postSchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request", issues: z.flattenError(parsed.error) },
      { status: 400 },
    );
  }
  const refused = await gatePost(request, parsed.data.pow);
  if (refused) return refused;
  try {
    await createPlace(parsed.data.place);
    return Response.json({ status: "pending" }, { status: 201 });
  } catch (err) {
    console.error("POST /api/places/contribute failed", err);
    return Response.json({ error: "Could not send it" }, { status: 500 });
  }
}
