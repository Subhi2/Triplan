import { z } from "zod";
import { canClub } from "@/lib/community/roles";
import { clubInputSchema, clubSlugSchema } from "@/lib/community/schemas";
import { clubView, deleteClub, updateClub } from "@/server/services/clubService";
import {
  failed,
  invalid,
  json,
  optionalRider,
  readJson,
  requireRider,
} from "@/server/services/communityHttp";
import { clubRides } from "@/server/services/groupRideService";
import { allowWrite } from "@/server/services/writeLimit";

type Ctx = { params: Promise<{ slug: string }> };

const notFound = () => json({ error: "Club not found" }, 404);

/** GET -> ClubView & { rides }: the club as this viewer may see it, with its coming rides. */
export async function GET(_request: Request, { params }: Ctx) {
  const slug = (await params).slug;
  if (!clubSlugSchema.safeParse(slug).success) return notFound();
  try {
    const me = await optionalRider();
    const view = await clubView(slug, me?.id ?? null);
    if (!view) return notFound();
    const rides = await clubRides(view.club.id, canClub(view.me?.seat ?? null, "view_private"));
    return json({ ...view, rides });
  } catch (err) {
    return failed("GET /api/clubs/[slug]", err);
  }
}

/** PATCH { club } -> { ok: true }: the owner or an admin changes the club. */
export async function PATCH(request: Request, { params }: Ctx) {
  const parsed = z.object({ club: clubInputSchema }).safeParse(await readJson(request));
  if (!parsed.success) return invalid(parsed.error);
  const me = await requireRider();
  if (me instanceof Response) return me;
  if (!(await allowWrite(request))) return json({ error: "Too many changes from here" }, 429);
  try {
    await updateClub((await params).slug, me.id, parsed.data.club);
    return json({ ok: true });
  } catch (err) {
    return failed("PATCH /api/clubs/[slug]", err);
  }
}

/** DELETE -> { deleted: true }: the owner deletes the club and its rides. */
export async function DELETE(request: Request, { params }: Ctx) {
  const me = await requireRider();
  if (me instanceof Response) return me;
  if (!(await allowWrite(request))) return json({ error: "Too many changes from here" }, 429);
  try {
    await deleteClub((await params).slug, me.id);
    return json({ deleted: true });
  } catch (err) {
    return failed("DELETE /api/clubs/[slug]", err);
  }
}
