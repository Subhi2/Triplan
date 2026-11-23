import { z } from "zod";
import { myBikeSchema } from "@/lib/myBike";
import { VEHICLES } from "@/lib/trip";
import {
  failed,
  invalid,
  json,
  optionalRider,
  readJson,
  requireRider,
} from "@/server/services/communityHttp";
import { bikesOf, saveBike } from "@/server/services/riderVehicleService";
import { allowWrite } from "@/server/services/writeLimit";

const putSchema = z.object({ vehicle: z.enum(VEHICLES), bike: myBikeSchema });

/**
 * GET -> { rider, bikes }: whether this browser has a rider account, and the rider's bike and
 * car ("My bike"). Private: only the rider reads them.
 */
export async function GET() {
  const me = await optionalRider();
  if (!me) return json({ rider: false, bikes: {} });
  try {
    return json({ rider: true, bikes: await bikesOf(me.id) });
  } catch (err) {
    return failed("GET /api/me/vehicle", err);
  }
}

/** PUT { vehicle, bike } -> { bike }: keeps the rider's bike (or car) with their account. */
export async function PUT(request: Request) {
  const me = await requireRider();
  if (me instanceof Response) return me;
  const parsed = putSchema.safeParse(await readJson(request));
  if (!parsed.success) return invalid(parsed.error);
  if (!(await allowWrite(request))) return json({ error: "Too many changes from here" }, 429);
  try {
    return json({ bike: await saveBike(me.id, parsed.data.vehicle, parsed.data.bike) });
  } catch (err) {
    return failed("PUT /api/me/vehicle", err);
  }
}
