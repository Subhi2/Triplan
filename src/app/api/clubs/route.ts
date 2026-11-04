import { z } from "zod";
import { clubInputSchema } from "@/lib/community/schemas";
import { createClub, listClubs } from "@/server/services/clubService";
import { failed, invalid, json, readJson, requireRider } from "@/server/services/communityHttp";
import { pointFromQuery } from "@/server/services/communityQuery";
import { gatePost } from "@/server/services/postGate";
import { powPayloadSchema } from "@/server/services/proofOfWork";

const postSchema = z.object({ club: clubInputSchema, pow: powPayloadSchema });

/** GET ?q=&lng=&lat= -> { clubs }: clubs by name or town, or near a point (docs/02, G6). */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  try {
    const clubs = await listClubs({
      q: params.get("q")?.slice(0, 60) ?? undefined,
      near: pointFromQuery(params),
    });
    return json({ clubs });
  } catch (err) {
    return failed("GET /api/clubs", err);
  }
}

/** POST { club, pow } -> 201 { club }: starts a club owned by this rider. Live at once. */
export async function POST(request: Request) {
  const parsed = postSchema.safeParse(await readJson(request));
  if (!parsed.success) return invalid(parsed.error);
  const me = await requireRider();
  if (me instanceof Response) return me;
  const refused = await gatePost(request, parsed.data.pow);
  if (refused) return refused;
  try {
    return json({ club: await createClub(me.id, parsed.data.club) }, 201);
  } catch (err) {
    return failed("POST /api/clubs", err);
  }
}
