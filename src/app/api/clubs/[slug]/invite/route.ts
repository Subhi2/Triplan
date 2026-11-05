import { resetInvite } from "@/server/services/clubService";
import { failed, json, requireRider } from "@/server/services/communityHttp";
import { allowWrite } from "@/server/services/writeLimit";

type Ctx = { params: Promise<{ slug: string }> };

/** POST -> { token }: a new invite link's token (the old link stops working), shown this once. */
export async function POST(request: Request, { params }: Ctx) {
  const me = await requireRider();
  if (me instanceof Response) return me;
  if (!(await allowWrite(request))) return json({ error: "Too many changes from here" }, 429);
  try {
    return json({ token: await resetInvite((await params).slug, me.id) });
  } catch (err) {
    return failed("POST /api/clubs/[slug]/invite", err);
  }
}
