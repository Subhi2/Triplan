import { z } from "zod";
import { deviceKeySchema, reviewInputSchema } from "@/lib/riderPosts";
import { gatePost } from "@/server/services/postGate";
import { powPayloadSchema } from "@/server/services/proofOfWork";
import { deleteReview, placeBySlug, saveReview } from "@/server/services/riderPostService";
import { allowWrite } from "@/server/services/writeLimit";

const postSchema = z.object({
  review: reviewInputSchema,
  pow: powPayloadSchema,
  deviceKey: deviceKeySchema,
});
const deleteSchema = z.object({ deviceKey: deviceKeySchema });

const invalid = (error: z.ZodError) =>
  Response.json({ error: "Invalid request", issues: z.flattenError(error) }, { status: 400 });

/**
 * POST { review, pow, deviceKey } -> 201 { status: "pending" }
 * A rider's review without sign-in (docs/02, "Reviews, photos and road reports"): one per place
 * per device (a second one replaces the first), pre-screened, shown after an admin approves it.
 */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const parsed = postSchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return invalid(parsed.error);
  const place = await placeBySlug((await params).slug);
  if (!place) return Response.json({ error: "Place not found" }, { status: 404 });
  const refused = await gatePost(request, parsed.data.pow);
  if (refused) return refused;
  try {
    await saveReview(place, parsed.data.review, parsed.data.deviceKey);
    return Response.json({ status: "pending" }, { status: 201 });
  } catch (err) {
    console.error("POST /api/places/[slug]/reviews failed", err);
    return Response.json({ error: "Could not save the review" }, { status: 500 });
  }
}

/** DELETE { deviceKey } -> 200 { deleted: true } | 404: this device's review of the place. */
export async function DELETE(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const parsed = deleteSchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) return invalid(parsed.error);
  if (!(await allowWrite(request))) {
    return Response.json({ error: "Too many changes from here" }, { status: 429 });
  }
  const place = await placeBySlug((await params).slug);
  if (!place) return Response.json({ error: "Place not found" }, { status: 404 });
  const deleted = await deleteReview(place, parsed.data.deviceKey);
  return deleted
    ? Response.json({ deleted: true })
    : Response.json({ error: "No review from this device" }, { status: 404 });
}
