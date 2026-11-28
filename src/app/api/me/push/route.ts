import { z } from "zod";
import { pushSubscriptionSchema } from "@/lib/pushNotices";
import { failed, invalid, json, readJson, requireRider } from "@/server/services/communityHttp";
import { pushEnabled, subscribe, unsubscribe } from "@/server/services/pushService";
import { allowWrite } from "@/server/services/writeLimit";

const deleteSchema = z.object({ endpoint: z.url().max(1000) });

/** POST <PushSubscription JSON> -> { on: true }: this device gets the rider's notices (G11). */
export async function POST(request: Request) {
  if (!pushEnabled()) return json({ error: "Notices are off" }, 404);
  const me = await requireRider();
  if (me instanceof Response) return me;
  const parsed = pushSubscriptionSchema.safeParse(await readJson(request));
  if (!parsed.success) return invalid(parsed.error);
  if (!(await allowWrite(request))) return json({ error: "Too many changes from here" }, 429);
  try {
    await subscribe(me.id, parsed.data);
    return json({ on: true }, 201);
  } catch (err) {
    return failed("POST /api/me/push", err);
  }
}

/** DELETE { endpoint } -> { on: false }: this device stops getting them. */
export async function DELETE(request: Request) {
  const me = await requireRider();
  if (me instanceof Response) return me;
  const parsed = deleteSchema.safeParse(await readJson(request));
  if (!parsed.success) return invalid(parsed.error);
  try {
    await unsubscribe(me.id, parsed.data.endpoint);
    return json({ on: false });
  } catch (err) {
    return failed("DELETE /api/me/push", err);
  }
}
