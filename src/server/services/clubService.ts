import { sql, type SQL } from "drizzle-orm";
import {
  canActOnClubMember,
  canClub,
  type ClubRole,
  type ClubSeat,
  type ClubStatus,
} from "@/lib/community/roles";
import { MAX_OWNED_CLUBS, type ClubInput, type ClubMemberAction } from "@/lib/community/schemas";
import type { ClubMemberRow, ClubPublic, ClubSummary, ClubView } from "@/lib/community/views";
import { slugify } from "@/lib/slug";
import { getDb } from "../db";
import { hashEditToken, newEditToken } from "./tripService";

// Clubs (docs/02, "Community (G6)"): a rider starts one and owns it; others join, ask to join, or
// come in by an invite link, by the club's policy. Owners and admins run the club; nobody else
// approves anything. Rules for who may do what are in src/lib/community/roles.ts.

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export class CommunityError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409 | 429,
  ) {
    super(message);
  }
}

interface SummaryRow extends Record<string, unknown> {
  id: string;
  slug: string;
  name: string;
  about: string;
  home_label: string;
  vehicle: string;
  join_policy: string;
  members: number;
  upcoming_rides: number;
  created_at: string | Date;
  home_lng: number | null;
  home_lat: number | null;
}

const iso = (d: string | Date) => (d instanceof Date ? d : new Date(d)).toISOString();

const SUMMARY_COLUMNS = sql`
  c.id, c.slug, c.name, c.about, c.home_label, c.vehicle, c.join_policy, c.created_at,
  ST_X(c.home_point::geometry) AS home_lng, ST_Y(c.home_point::geometry) AS home_lat,
  (SELECT count(*)::int FROM club_member WHERE club_id = c.id AND status = 'active') AS members,
  (SELECT count(*)::int FROM group_ride
   WHERE club_id = c.id AND NOT cancelled AND starts_at > now()) AS upcoming_rides`;

function toSummary(r: SummaryRow): ClubSummary {
  return {
    slug: r.slug,
    name: r.name,
    homeLabel: r.home_label,
    vehicle: r.vehicle as ClubSummary["vehicle"],
    joinPolicy: r.join_policy as ClubSummary["joinPolicy"],
    members: r.members,
    upcomingRides: r.upcoming_rides,
  };
}

function toPublic(r: SummaryRow): ClubPublic {
  return {
    ...toSummary(r),
    id: r.id,
    about: r.about,
    homePoint: r.home_lng === null || r.home_lat === null ? null : [r.home_lng, r.home_lat],
    createdAt: iso(r.created_at),
  };
}

/** A slug for a new club's name, numbered when taken ("hassan-riders-2"). */
async function freeSlug(tx: Tx, name: string): Promise<string> {
  const base = slugify(name).slice(0, 60) || "club";
  const taken = await tx.execute<{ slug: string }>(sql`
    SELECT slug FROM club WHERE slug = ${base} OR slug LIKE ${`${base}-%`}`);
  const used = new Set(taken.map((t) => t.slug));
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) if (!used.has(`${base}-${n}`)) return `${base}-${n}`;
}

const point = (p: [number, number] | null) =>
  p ? sql`ST_SetSRID(ST_MakePoint(${p[0]}, ${p[1]}), 4326)::geography` : sql`NULL`;

/** Starts a club owned by this rider. */
export async function createClub(riderId: string, input: ClubInput): Promise<ClubSummary> {
  const slug = await getDb().transaction(async (tx) => {
    const [owned] = await tx.execute<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM club_member WHERE rider_id = ${riderId} AND role = 'owner'`);
    if ((owned?.n ?? 0) >= MAX_OWNED_CLUBS) {
      throw new CommunityError(`You can own up to ${MAX_OWNED_CLUBS} clubs.`, 409);
    }
    const slug = await freeSlug(tx, input.name);
    const [row] = await tx.execute<{ id: string }>(sql`
      INSERT INTO club (slug, name, about, home_label, home_point, vehicle, join_policy, whatsapp_url)
      VALUES (${slug}, ${input.name}, ${input.about}, ${input.homeLabel}, ${point(input.homePoint)},
              ${input.vehicle}, ${input.joinPolicy}, ${input.whatsappUrl})
      RETURNING id`);
    await tx.execute(sql`
      INSERT INTO club_member (club_id, rider_id, role, status, decided_at)
      VALUES (${row!.id}, ${riderId}, 'owner', 'active', now())`);
    return slug;
  });
  return (await clubBySlug(slug))!;
}

export async function clubBySlug(slug: string): Promise<ClubPublic | null> {
  const [row] = await getDb().execute<SummaryRow>(sql`
    SELECT ${SUMMARY_COLUMNS} FROM club c WHERE c.slug = ${slug}`);
  return row ? toPublic(row) : null;
}

/**
 * Clubs for the list: near a point first when one is given (within 300 km), else the biggest.
 * `q` matches the name or home town.
 */
export async function listClubs(opts: { near?: [number, number]; q?: string; limit?: number }) {
  const q = opts.q?.trim() ? `%${opts.q.trim().replace(/[%_]/g, "")}%` : null;
  const near = opts.near;
  const rows = await getDb().execute<SummaryRow>(sql`
    SELECT ${SUMMARY_COLUMNS} FROM club c
    WHERE (${q}::text IS NULL OR c.name ILIKE ${q} OR c.home_label ILIKE ${q})
      ${near ? sql`AND c.home_point IS NOT NULL AND ST_DWithin(c.home_point, ${point(near)}, 300000)` : sql``}
    ORDER BY ${near ? sql`ST_Distance(c.home_point, ${point(near)})` : sql`members DESC, c.created_at DESC`}
    LIMIT ${opts.limit ?? 50}`);
  return rows.map(toSummary);
}

/** This rider's seat in the club, or null. */
export async function clubSeat(clubId: string, riderId: string | null): Promise<ClubSeat | null> {
  if (!riderId) return null;
  const [row] = await getDb().execute<{ role: ClubRole; status: ClubStatus }>(sql`
    SELECT role, status FROM club_member WHERE club_id = ${clubId} AND rider_id = ${riderId}`);
  return row ?? null;
}

interface MemberSqlRow extends Record<string, unknown> {
  rider_id: string;
  nickname: string;
  role: ClubRole;
  status: ClubStatus;
  note: string;
  at: string | Date;
}

async function memberRows(clubId: string, statuses: ClubStatus[]): Promise<ClubMemberRow[]> {
  const rows = await getDb().execute<MemberSqlRow>(sql`
    SELECT m.rider_id, r.nickname, m.role, m.status, m.note,
           coalesce(m.decided_at, m.created_at) AS at
    FROM club_member m JOIN rider r ON r.id = m.rider_id
    WHERE m.club_id = ${clubId}
      AND m.status IN (SELECT jsonb_array_elements_text(${JSON.stringify(statuses)}::jsonb))
    ORDER BY array_position(ARRAY['owner', 'admin', 'member'], m.role), m.created_at
    LIMIT 500`);
  return rows.map((r) => ({
    riderId: r.rider_id,
    nickname: r.nickname,
    role: r.role,
    status: r.status,
    note: r.note,
    at: iso(r.at),
  }));
}

/** The club as this viewer may see it. */
export async function clubView(slug: string, riderId: string | null): Promise<ClubView | null> {
  const club = await clubBySlug(slug);
  if (!club) return null;
  const seat = await clubSeat(club.id, riderId);
  const view: ClubView = { club, me: riderId ? { riderId, seat } : null };
  if (canClub(seat, "view_private")) {
    const [extra] = await getDb().execute<{ whatsapp_url: string | null; has_invite: boolean }>(sql`
      SELECT whatsapp_url, invite_token_hash IS NOT NULL AS has_invite FROM club WHERE id = ${club.id}`);
    view.whatsappUrl = extra?.whatsapp_url ?? null;
    view.members = await memberRows(club.id, ["active"]);
    if (canClub(seat, "manage_members")) {
      view.requests = await memberRows(club.id, ["pending"]);
      view.blocked = await memberRows(club.id, ["blocked"]);
      view.hasInvite = extra?.has_invite ?? false;
    }
  }
  return view;
}

/**
 * A rider joins or asks to join. An open club lets them straight in; an approval club keeps the
 * request for its owner and admins; an invite-only club needs the invite link's token. Blocked
 * riders stay out; members asking again change nothing.
 */
export async function joinClub(
  slug: string,
  riderId: string,
  opts: { note: string; inviteToken?: string | null },
): Promise<ClubSeat> {
  return getDb().transaction(async (tx) => {
    const [club] = await tx.execute<{ id: string; join_policy: string; invite: string | null }>(
      sql`SELECT id, join_policy, invite_token_hash AS invite FROM club WHERE slug = ${slug}`,
    );
    if (!club) throw new CommunityError("Club not found", 404);
    const [seat] = await tx.execute<{ role: ClubRole; status: ClubStatus }>(sql`
      SELECT role, status FROM club_member WHERE club_id = ${club.id} AND rider_id = ${riderId}`);
    if (seat?.status === "blocked") throw new CommunityError("You can't join this club.", 403);
    if (seat) return seat;
    const invited =
      Boolean(opts.inviteToken) &&
      club.invite !== null &&
      hashEditToken(opts.inviteToken!) === club.invite;
    if (club.join_policy === "invite" && !invited) {
      throw new CommunityError("This club takes members by invite link only.", 403);
    }
    const status: ClubStatus = club.join_policy === "open" || invited ? "active" : "pending";
    await tx.execute(sql`
      INSERT INTO club_member (club_id, rider_id, role, status, note, decided_at)
      VALUES (${club.id}, ${riderId}, 'member', ${status}, ${opts.note},
              ${status === "active" ? sql`now()` : sql`NULL`})`);
    return { role: "member", status };
  });
}

/** A member leaves, or a rider takes back a request. The owner hands the club on first. */
export async function leaveClub(slug: string, riderId: string): Promise<void> {
  const club = await clubBySlug(slug);
  if (!club) throw new CommunityError("Club not found", 404);
  const seat = await clubSeat(club.id, riderId);
  if (!seat || seat.status === "blocked") return;
  if (seat.role === "owner") {
    throw new CommunityError("Make someone else the owner before you leave.", 409);
  }
  await getDb().execute(sql`
    DELETE FROM club_member WHERE club_id = ${club.id} AND rider_id = ${riderId}`);
}

/** An owner or admin acts on a member or a request, as roles.ts allows. */
export async function actOnClubMember(
  slug: string,
  actorId: string,
  targetId: string,
  action: ClubMemberAction,
): Promise<void> {
  await getDb().transaction(async (tx) => {
    const [club] = await tx.execute<{ id: string }>(sql`SELECT id FROM club WHERE slug = ${slug}`);
    if (!club) throw new CommunityError("Club not found", 404);
    const seats = await tx.execute<{ rider_id: string; role: ClubRole; status: ClubStatus }>(sql`
      SELECT rider_id, role, status FROM club_member
      WHERE club_id = ${club.id} AND rider_id IN (${actorId}, ${targetId})
      FOR UPDATE`);
    const actor = seats.find((s) => s.rider_id === actorId) ?? null;
    const target = seats.find((s) => s.rider_id === targetId);
    if (!target) throw new CommunityError("Not a member or request of this club", 404);
    if (!canActOnClubMember(actor, target, actorId === targetId)) {
      throw new CommunityError("You can't do that in this club.", 403);
    }
    const ownerOnly =
      action === "make_admin" || action === "make_member" || action === "make_owner";
    if (ownerOnly && !canClub(actor, action === "make_owner" ? "transfer" : "set_admins")) {
      throw new CommunityError("Only the owner can change roles.", 403);
    }
    const set = (fields: SQL) =>
      tx.execute(sql`
        UPDATE club_member SET ${fields}, decided_at = now()
        WHERE club_id = ${club.id} AND rider_id = ${targetId}`);
    switch (action) {
      case "approve":
        if (target.status !== "pending") throw new CommunityError("No request to approve", 409);
        return set(sql`status = 'active'`);
      case "decline":
      case "remove":
        return tx.execute(sql`
          DELETE FROM club_member WHERE club_id = ${club.id} AND rider_id = ${targetId}`);
      case "block":
        return set(sql`status = 'blocked', role = 'member'`);
      case "unblock":
        return tx.execute(sql`
          DELETE FROM club_member
          WHERE club_id = ${club.id} AND rider_id = ${targetId} AND status = 'blocked'`);
      case "make_admin":
      case "make_member":
      case "make_owner":
        if (target.status !== "active") throw new CommunityError("Only members get roles", 409);
        if (action === "make_owner") {
          await tx.execute(sql`
            UPDATE club_member SET role = 'admin'
            WHERE club_id = ${club.id} AND rider_id = ${actorId}`);
          return set(sql`role = 'owner'`);
        }
        return set(sql`role = ${action === "make_admin" ? "admin" : "member"}`);
    }
  });
}

/** An owner or admin changes the club's details. */
export async function updateClub(slug: string, riderId: string, input: ClubInput): Promise<void> {
  const club = await clubBySlug(slug);
  if (!club) throw new CommunityError("Club not found", 404);
  if (!canClub(await clubSeat(club.id, riderId), "edit")) {
    throw new CommunityError("Only the club's owner and admins can change it.", 403);
  }
  await getDb().execute(sql`
    UPDATE club SET name = ${input.name}, about = ${input.about}, home_label = ${input.homeLabel},
      home_point = ${point(input.homePoint)}, vehicle = ${input.vehicle},
      join_policy = ${input.joinPolicy}, whatsapp_url = ${input.whatsappUrl}
    WHERE id = ${club.id}`);
}

/** A new invite link's token (the old link stops working). Shown this once. */
export async function resetInvite(slug: string, riderId: string): Promise<string> {
  const club = await clubBySlug(slug);
  if (!club) throw new CommunityError("Club not found", 404);
  if (!canClub(await clubSeat(club.id, riderId), "reset_invite")) {
    throw new CommunityError("Only the club's owner and admins can make invite links.", 403);
  }
  const invite = newEditToken();
  await getDb().execute(
    sql`UPDATE club SET invite_token_hash = ${invite.hash} WHERE id = ${club.id}`,
  );
  return invite.token;
}

/** The owner deletes the club, with its rides. */
export async function deleteClub(slug: string, riderId: string): Promise<void> {
  const club = await clubBySlug(slug);
  if (!club) throw new CommunityError("Club not found", 404);
  if (!canClub(await clubSeat(club.id, riderId), "delete")) {
    throw new CommunityError("Only the owner can delete the club.", 403);
  }
  await getDb().execute(sql`DELETE FROM club WHERE id = ${club.id}`);
}

/** The clubs this rider is in or asked to join, for /me. */
export async function clubsOf(riderId: string) {
  const rows = await getDb().execute<SummaryRow & { role: ClubRole; status: ClubStatus }>(sql`
    SELECT ${SUMMARY_COLUMNS}, m.role, m.status
    FROM club_member m JOIN club c ON c.id = m.club_id
    WHERE m.rider_id = ${riderId} AND m.status <> 'blocked'
    ORDER BY m.created_at DESC
    LIMIT 100`);
  return rows.map((r) => ({ ...toSummary(r), role: r.role, status: r.status }));
}

/** Requests waiting in clubs this rider owns or runs. */
export async function waitingClubRequests(riderId: string): Promise<number> {
  const [row] = await getDb().execute<{ n: number }>(sql`
    SELECT count(*)::int AS n
    FROM club_member req
    JOIN club_member me ON me.club_id = req.club_id
    WHERE me.rider_id = ${riderId} AND me.status = 'active' AND me.role IN ('owner', 'admin')
      AND req.status = 'pending'`);
  return row?.n ?? 0;
}

/** Decisions on this rider's club requests since `since`. */
export async function decidedClubRequests(riderId: string, since: Date): Promise<number> {
  const [row] = await getDb().execute<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM club_member
    WHERE rider_id = ${riderId} AND role <> 'owner' AND decided_at > created_at
      AND decided_at > ${since.toISOString()}`);
  return row?.n ?? 0;
}

/** Platform admins only: removes a club by its slug (a legal takedown). */
export async function takeDownClub(slug: string): Promise<boolean> {
  const rows = await getDb().execute(sql`DELETE FROM club WHERE slug = ${slug} RETURNING id`);
  return rows.length > 0;
}
