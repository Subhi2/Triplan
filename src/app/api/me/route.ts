import { z } from "zod";
import { nicknameSchema } from "@/lib/community/schemas";
import type { MeOverview } from "@/lib/community/views";
import { accountForNewRider, currentAccount, endSession } from "@/server/auth/session";
import { clubsOf } from "@/server/services/clubService";
import {
  failed,
  invalid,
  json,
  optionalRider,
  readJson,
  requireRider,
} from "@/server/services/communityHttp";
import { ridesOf } from "@/server/services/groupRideService";
import { deleteRider, saveRider } from "@/server/services/riderService";
import { allowWrite } from "@/server/services/writeLimit";

const postSchema = z.object({ nickname: nicknameSchema });

/** GET -> MeOverview | { me: null }: this rider, their clubs and their rides (docs/02, G6). */
export async function GET() {
  try {
    const me = await optionalRider();
    if (!me) return json({ me: null });
    const [clubs, rides] = await Promise.all([clubsOf(me.id), ridesOf(me.id)]);
    return json({ me, clubs, rides } satisfies MeOverview);
  } catch (err) {
    return failed("GET /api/me", err);
  }
}

/**
 * POST { nickname } -> { me }: picks or changes the nickname, making the rider the first time.
 * With Supabase the browser has already signed in (anonymously); without a session: 401.
 */
export async function POST(request: Request) {
  const parsed = postSchema.safeParse(await readJson(request));
  if (!parsed.success) return invalid(parsed.error);
  if (!(await allowWrite(request))) return json({ error: "Too many changes from here" }, 429);
  try {
    const account = await accountForNewRider();
    if (!account) return json({ error: "No device account yet", code: "NO_ACCOUNT" }, 401);
    return json({ me: await saveRider(account, parsed.data.nickname) });
  } catch (err) {
    return failed("POST /api/me", err);
  }
}

/**
 * DELETE -> { deleted: true }: deletes the rider and their account; clubs and rides pass on.
 * DELETE ?session=only -> { signedOut: true }: only signs this browser out.
 */
export async function DELETE(request: Request) {
  if (new URL(request.url).searchParams.get("session") === "only") {
    await endSession();
    return json({ signedOut: true });
  }
  const me = await requireRider();
  if (me instanceof Response) {
    // An account that never picked a nickname has nothing to hand on: just sign it out.
    if (!(await currentAccount())) return me;
    await endSession();
    return json({ deleted: true });
  }
  if (!(await allowWrite(request))) return json({ error: "Too many changes from here" }, 429);
  try {
    await deleteRider(me.id);
    await endSession();
    return json({ deleted: true });
  } catch (err) {
    return failed("DELETE /api/me", err);
  }
}
