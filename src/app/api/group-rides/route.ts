import { z } from "zod";
import { groupRideInputSchema } from "@/lib/community/schemas";
import { failed, invalid, json, readJson, requireRider } from "@/server/services/communityHttp";
import { pointFromQuery } from "@/server/services/communityQuery";
import { createGroupRide, listGroupRides } from "@/server/services/groupRideService";
import { gatePost } from "@/server/services/postGate";
import { powPayloadSchema } from "@/server/services/proofOfWork";

const postSchema = z.object({ ride: groupRideInputSchema, pow: powPayloadSchema });
const listSchema = z.object({
  month: z.coerce.number().int().min(1).max(12).optional(),
  vehicle: z.enum(["bike", "car"]).optional(),
});

/** GET ?lng=&lat=&month=&vehicle= -> { rides }: public rides that have not started (docs/02, G6). */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const filters = listSchema.safeParse({
    month: params.get("month") ?? undefined,
    vehicle: params.get("vehicle") ?? undefined,
  });
  if (!filters.success) return invalid(filters.error);
  try {
    const rides = await listGroupRides({ ...filters.data, near: pointFromQuery(params) });
    return json({ rides });
  } catch (err) {
    return failed("GET /api/group-rides", err);
  }
}

/** POST { ride, pow } -> 201 { id }: puts up a ride hosted by this rider. Live at once. */
export async function POST(request: Request) {
  const parsed = postSchema.safeParse(await readJson(request));
  if (!parsed.success) return invalid(parsed.error);
  const me = await requireRider();
  if (me instanceof Response) return me;
  const refused = await gatePost(request, parsed.data.pow);
  if (refused) return refused;
  try {
    return json({ id: await createGroupRide(me.id, parsed.data.ride) }, 201);
  } catch (err) {
    return failed("POST /api/group-rides", err);
  }
}
