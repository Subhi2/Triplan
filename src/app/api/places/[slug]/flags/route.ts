import { z } from "zod";
import { deviceKeySchema, placeFlagInputSchema } from "@/lib/riderPosts";
import { gatePost } from "@/server/services/postGate";
import { powPayloadSchema } from "@/server/services/proofOfWork";
import { placeBySlug, savePlaceFlag } from "@/server/services/riderPostService";

const postSchema = z.object({
  flag: placeFlagInputSchema,
  pow: powPayloadSchema,
  deviceKey: deviceKeySchema,
});

/**
 * POST { flag, pow, deviceKey } -> 201 { status: "pending" }
 * "Something's wrong here" (G8): a rider says the place is closed, in the wrong spot, the wrong
 * kind or listed twice. One open flag per place per device (a second one replaces it),
 * pre-screened, read only by an admin; never shown on the site.
 */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const parsed = postSchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request", issues: z.flattenError(parsed.error) },
      { status: 400 },
    );
  }
  const place = await placeBySlug((await params).slug);
  if (!place) return Response.json({ error: "Place not found" }, { status: 404 });
  const refused = await gatePost(request, parsed.data.pow);
  if (refused) return refused;
  try {
    await savePlaceFlag(place, parsed.data.flag, parsed.data.deviceKey);
    return Response.json({ status: "pending" }, { status: 201 });
  } catch (err) {
    console.error("POST /api/places/[slug]/flags failed", err);
    return Response.json({ error: "Could not send it" }, { status: 500 });
  }
}
