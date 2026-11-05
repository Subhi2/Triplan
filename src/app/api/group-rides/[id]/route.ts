import { z } from "zod";
import { groupRideUpdateSchema } from "@/lib/community/schemas";
import {
  failed,
  invalid,
  json,
  optionalRider,
  readJson,
  requireRider,
} from "@/server/services/communityHttp";
import { groupRideView, updateGroupRide } from "@/server/services/groupRideService";
import { allowWrite } from "@/server/services/writeLimit";

type Ctx = { params: Promise<{ id: string }> };

const notFound = () => json({ error: "Ride not found" }, 404);

/** GET -> GroupRideView: the ride as this viewer may see it (private parts for its riders). */
export async function GET(_request: Request, { params }: Ctx) {
  const id = (await params).id;
  if (!z.uuid().safeParse(id).success) return notFound();
  try {
    const me = await optionalRider();
    const view = await groupRideView(id, me?.id ?? null);
    return view ? json(view) : notFound();
  } catch (err) {
    return failed("GET /api/group-rides/[id]", err);
  }
}

/** PATCH { update } -> { ok: true }: the host or a co-host changes the ride; the host calls it off. */
export async function PATCH(request: Request, { params }: Ctx) {
  const id = (await params).id;
  if (!z.uuid().safeParse(id).success) return notFound();
  const parsed = z.object({ update: groupRideUpdateSchema }).safeParse(await readJson(request));
  if (!parsed.success) return invalid(parsed.error);
  const me = await requireRider();
  if (me instanceof Response) return me;
  if (!(await allowWrite(request))) return json({ error: "Too many changes from here" }, 429);
  try {
    await updateGroupRide(id, me.id, parsed.data.update);
    return json({ ok: true });
  } catch (err) {
    return failed("PATCH /api/group-rides/[id]", err);
  }
}
