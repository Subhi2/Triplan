import { z } from "zod";
import { rideMarkSchema } from "@/lib/community/schemas";
import { failed, invalid, json, readJson, requireRider } from "@/server/services/communityHttp";
import { marksOf, removeMark, saveMark } from "@/server/services/rideMarkService";
import { allowWrite } from "@/server/services/writeLimit";

const deleteSchema = z.object({ rideSlug: z.string().min(1).max(120) });

/** GET -> { marks }: this rider's bucket list. Private: nobody else can read it. */
export async function GET() {
  const me = await requireRider();
  if (me instanceof Response) return me;
  try {
    return json({ marks: await marksOf(me.id) });
  } catch (err) {
    return failed("GET /api/me/rides", err);
  }
}

/** PUT { rideSlug, status, doneOn?, note? } -> { mark }: want to ride, or done. */
export async function PUT(request: Request) {
  const me = await requireRider();
  if (me instanceof Response) return me;
  const parsed = rideMarkSchema.safeParse(await readJson(request));
  if (!parsed.success) return invalid(parsed.error);
  if (!(await allowWrite(request))) return json({ error: "Too many changes from here" }, 429);
  try {
    return json({ mark: await saveMark(me.id, parsed.data) });
  } catch (err) {
    return failed("PUT /api/me/rides", err);
  }
}

/** DELETE { rideSlug } -> { removed }: takes a ride off the list. */
export async function DELETE(request: Request) {
  const me = await requireRider();
  if (me instanceof Response) return me;
  const parsed = deleteSchema.safeParse(await readJson(request));
  if (!parsed.success) return invalid(parsed.error);
  if (!(await allowWrite(request))) return json({ error: "Too many changes from here" }, 429);
  try {
    return json({ removed: await removeMark(me.id, parsed.data.rideSlug) });
  } catch (err) {
    return failed("DELETE /api/me/rides", err);
  }
}
