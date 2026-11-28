import { z } from "zod";
import { clubDecisionNotice } from "@/lib/pushNotices";
import { CLUB_MEMBER_ACTIONS } from "@/lib/community/schemas";
import { actOnClubMember } from "@/server/services/clubService";
import { clubName, notifyLater, notifyRiders } from "@/server/services/pushService";
import { failed, invalid, json, readJson, requireRider } from "@/server/services/communityHttp";
import { allowWrite } from "@/server/services/writeLimit";

type Ctx = { params: Promise<{ slug: string; riderId: string }> };

const postSchema = z.object({ action: z.enum(CLUB_MEMBER_ACTIONS) });

/** POST { action } -> { ok: true }: the owner or an admin acts on a member or a request. */
export async function POST(request: Request, { params }: Ctx) {
  const parsed = postSchema.safeParse(await readJson(request));
  if (!parsed.success) return invalid(parsed.error);
  const { slug, riderId } = await params;
  if (!z.uuid().safeParse(riderId).success) return json({ error: "Not a member" }, 404);
  const me = await requireRider();
  if (me instanceof Response) return me;
  if (!(await allowWrite(request))) return json({ error: "Too many changes from here" }, 429);
  try {
    await actOnClubMember(slug, me.id, riderId, parsed.data.action);
    const action = parsed.data.action;
    if (action === "approve" || action === "decline") {
      notifyLater(async () => {
        await notifyRiders(
          [riderId],
          clubDecisionNotice(await clubName(slug), slug, action === "approve"),
        );
      });
    }
    return json({ ok: true });
  } catch (err) {
    return failed("POST /api/clubs/[slug]/members/[riderId]", err);
  }
}
