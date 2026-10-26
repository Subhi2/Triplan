import { z } from "zod";
import { nicknameSchema } from "@/lib/rideRoom";
import { deviceKeySchema, PHOTO_MAX_BYTES, PHOTO_TYPES } from "@/lib/riderPosts";
import { gatePost } from "@/server/services/postGate";
import { PhotoRejected } from "@/server/services/photoService";
import { powPayloadSchema } from "@/server/services/proofOfWork";
import { PhotoStoreMissing, placeBySlug, savePhoto } from "@/server/services/riderPostService";

// Resizing a phone photo twice takes a few seconds on a small server.
export const maxDuration = 30;

const fieldsSchema = z.object({
  nickname: nicknameSchema,
  // The rider confirms they took it and lets us show it (licence "user-granted").
  consent: z.literal("yes"),
  deviceKey: deviceKeySchema,
  pow: z
    .string()
    .max(4000)
    .transform((s, ctx) => {
      try {
        return JSON.parse(s) as unknown;
      } catch {
        ctx.addIssue({ code: "custom", message: "Not JSON" });
        return z.NEVER;
      }
    })
    .pipe(powPayloadSchema),
});

/**
 * POST multipart { photo, nickname, consent: "yes", deviceKey, pow } -> 201 { status: "pending" }
 * A rider's photo of a place: at most 8 MB, resized to 1600 px and 400 px with its metadata
 * (GPS, phone, time) removed, shown after an admin approves it.
 */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > PHOTO_MAX_BYTES + 64 * 1024) {
    return Response.json({ error: "The photo is over 8 MB" }, { status: 413 });
  }
  const form = await request.formData().catch(() => null);
  const photo = form?.get("photo");
  const parsed = fieldsSchema.safeParse(
    Object.fromEntries(["nickname", "consent", "deviceKey", "pow"].map((k) => [k, form?.get(k)])),
  );
  if (!parsed.success || !(photo instanceof File)) {
    return Response.json({ error: "Send a photo, a name and your consent" }, { status: 400 });
  }
  if (!(PHOTO_TYPES as readonly string[]).includes(photo.type)) {
    return Response.json({ error: "Use a JPEG, PNG or WebP photo" }, { status: 415 });
  }
  if (photo.size > PHOTO_MAX_BYTES) {
    return Response.json({ error: "The photo is over 8 MB" }, { status: 413 });
  }
  const place = await placeBySlug((await params).slug);
  if (!place) return Response.json({ error: "Place not found" }, { status: 404 });
  const refused = await gatePost(request, parsed.data.pow);
  if (refused) return refused;
  try {
    const bytes = new Uint8Array(await photo.arrayBuffer());
    await savePhoto(place, bytes, parsed.data.nickname, parsed.data.deviceKey);
    return Response.json({ status: "pending" }, { status: 201 });
  } catch (err) {
    if (err instanceof PhotoRejected) {
      return Response.json({ error: err.message }, { status: 422 });
    }
    if (err instanceof PhotoStoreMissing) {
      return Response.json({ error: "Photos are not open yet" }, { status: 503 });
    }
    console.error("POST /api/places/[slug]/photos failed", err);
    return Response.json({ error: "Could not save the photo" }, { status: 500 });
  }
}
