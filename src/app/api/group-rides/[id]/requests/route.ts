import { z } from "zod";
import { joinRequestSchema } from "@/lib/community/schemas";
import { failed, invalid, json, readJson, requireRider } from "@/server/services/communityHttp";
import { leaveRide, requestToJoin } from "@/server/services/groupRideService";
import { gatePost } from "@/server/services/postGate";
import { powPayloadSchema } from "@/server/services/proofOfWork";
import { allowWrite } from "@/server/services/writeLimit";

type Ctx = { params: Promise<{ id: string }> };

const postSchema = z.object({ request: joinRequestSchema, pow: powPayloadSchema });
const notFound = () => json({ error: "Ride not found" }, 404);

/**
 * POST { request, pow } -> { status }: asks to join. "approved" on an open ride with seats,
 * "waitlist" when it is full, "pending" while the host decides.
 */
export async function POST(request: Request, { params }: Ctx) {
  const id = (await params).id;
  if (!z.uuid().safeParse(id).success) return notFound();
  const parsed = postSchema.safeParse(await readJson(request));
  if (!parsed.success) return invalid(parsed.error);
  const me = await requireRider();
  if (me instanceof Response) return me;
  const refused = await gatePost(request, parsed.data.pow);
  if (refused) return refused;
  try {
    return json({ status: await requestToJoin(id, me.id, parsed.data.request) });
  } catch (err) {
    return failed("POST /api/group-rides/[id]/requests", err);
  }
}

/** DELETE -> { left: true }: leave the ride, or take back the request. */
export async function DELETE(request: Request, { params }: Ctx) {
  const id = (await params).id;
  if (!z.uuid().safeParse(id).success) return notFound();
  const me = await requireRider();
  if (me instanceof Response) return me;
  if (!(await allowWrite(request))) return json({ error: "Too many changes from here" }, 429);
  try {
    await leaveRide(id, me.id);
    return json({ left: true });
  } catch (err) {
    return failed("DELETE /api/group-rides/[id]/requests", err);
  }
}
