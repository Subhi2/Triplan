import { z } from "zod";
import { logEntrySchema } from "@/lib/rideLog";
import { failed, invalid, json, readJson, requireRider } from "@/server/services/communityHttp";
import { addToLog, logOf, removeFromLog } from "@/server/services/rideLogService";
import { allowWrite } from "@/server/services/writeLimit";

const deleteSchema = z.object({ id: z.uuid() });

/** GET -> { entries }: this rider's ride log. Private: nobody else can read it. */
export async function GET() {
  const me = await requireRider();
  if (me instanceof Response) return me;
  try {
    return json({ entries: await logOf(me.id) });
  } catch (err) {
    return failed("GET /api/me/log", err);
  }
}

/** POST { riddenOn, title, distanceKm, hairpins?, climbM?, tripId? } -> { logged: true } */
export async function POST(request: Request) {
  const me = await requireRider();
  if (me instanceof Response) return me;
  const parsed = logEntrySchema.safeParse(await readJson(request));
  if (!parsed.success) return invalid(parsed.error);
  if (!(await allowWrite(request))) return json({ error: "Too many changes from here" }, 429);
  try {
    await addToLog(me.id, parsed.data);
    return json({ logged: true }, 201);
  } catch (err) {
    return failed("POST /api/me/log", err);
  }
}

/** DELETE { id } -> { removed } */
export async function DELETE(request: Request) {
  const me = await requireRider();
  if (me instanceof Response) return me;
  const parsed = deleteSchema.safeParse(await readJson(request));
  if (!parsed.success) return invalid(parsed.error);
  if (!(await allowWrite(request))) return json({ error: "Too many changes from here" }, 429);
  try {
    return json({ removed: await removeFromLog(me.id, parsed.data.id) });
  } catch (err) {
    return failed("DELETE /api/me/log", err);
  }
}
