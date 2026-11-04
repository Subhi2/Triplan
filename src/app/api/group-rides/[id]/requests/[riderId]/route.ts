import { z } from "zod";
import { RIDE_MEMBER_ACTIONS } from "@/lib/community/schemas";
import { failed, invalid, json, readJson, requireRider } from "@/server/services/communityHttp";
import { actOnRideMember } from "@/server/services/groupRideService";
import { allowWrite } from "@/server/services/writeLimit";

type Ctx = { params: Promise<{ id: string; riderId: string }> };

const postSchema = z.object({ action: z.enum(RIDE_MEMBER_ACTIONS) });

/** POST { action } -> { ok: true }: the host or a co-host acts on a rider or a request. */
export async function POST(request: Request, { params }: Ctx) {
  const parsed = postSchema.safeParse(await readJson(request));
  if (!parsed.success) return invalid(parsed.error);
  const { id, riderId } = await params;
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(riderId).success) {
    return json({ error: "Not on this ride" }, 404);
  }
  const me = await requireRider();
  if (me instanceof Response) return me;
  if (!(await allowWrite(request))) return json({ error: "Too many changes from here" }, 429);
  try {
    await actOnRideMember(id, me.id, riderId, parsed.data.action);
    return json({ ok: true });
  } catch (err) {
    return failed("POST /api/group-rides/[id]/requests/[riderId]", err);
  }
}
