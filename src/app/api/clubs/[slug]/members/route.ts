import { z } from "zod";
import { joinClub, leaveClub } from "@/server/services/clubService";
import { failed, invalid, json, readJson, requireRider } from "@/server/services/communityHttp";
import { gatePost } from "@/server/services/postGate";
import { powPayloadSchema } from "@/server/services/proofOfWork";
import { allowWrite } from "@/server/services/writeLimit";

type Ctx = { params: Promise<{ slug: string }> };

const postSchema = z.object({
  note: z.string().trim().max(300).default(""),
  invite: z
    .string()
    .regex(/^[A-Za-z0-9_-]{43}$/)
    .nullable()
    .default(null),
  pow: powPayloadSchema,
});

/** POST { note, invite?, pow } -> { seat }: join, or ask to join, by the club's policy. */
export async function POST(request: Request, { params }: Ctx) {
  const parsed = postSchema.safeParse(await readJson(request));
  if (!parsed.success) return invalid(parsed.error);
  const me = await requireRider();
  if (me instanceof Response) return me;
  const refused = await gatePost(request, parsed.data.pow);
  if (refused) return refused;
  try {
    const seat = await joinClub((await params).slug, me.id, {
      note: parsed.data.note,
      inviteToken: parsed.data.invite,
    });
    return json({ seat });
  } catch (err) {
    return failed("POST /api/clubs/[slug]/members", err);
  }
}

/** DELETE -> { left: true }: leave the club, or take back a request. */
export async function DELETE(request: Request, { params }: Ctx) {
  const me = await requireRider();
  if (me instanceof Response) return me;
  if (!(await allowWrite(request))) return json({ error: "Too many changes from here" }, 429);
  try {
    await leaveClub((await params).slug, me.id);
    return json({ left: true });
  } catch (err) {
    return failed("DELETE /api/clubs/[slug]/members", err);
  }
}
