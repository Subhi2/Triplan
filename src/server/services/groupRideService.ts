import { sql, type SQL } from "drizzle-orm";
import type { LngLat } from "@/lib/geo";
import {
  canActOnRideMember,
  canClub,
  canRide,
  canSeeRide,
  type ClubSeat,
  type RideRole,
  type RideSeat,
  type RideStatus,
} from "@/lib/community/roles";
import {
  MAX_DAYS_AHEAD,
  MAX_UPCOMING_HOSTED,
  type GroupRideInput,
  type GroupRideUpdate,
  type JoinRequestInput,
  type RideMemberAction,
} from "@/lib/community/schemas";
import {
  newRequestStatus,
  promoteFromWaitlist,
  seatsLeft,
  type SeatHolder,
} from "@/lib/community/seats";
import type {
  GroupRidePublic,
  GroupRideState,
  GroupRideSummary,
  GroupRideView,
  RideMemberRow,
} from "@/lib/community/views";
import { newRoomId, rideRoomPath } from "@/lib/rideRoom";
import type { Vehicle } from "@/lib/trip";
import { getDb } from "../db";
import { clubSeat, CommunityError } from "./clubService";
import { getTripLine } from "./tripService";

// Hosted group rides (docs/02, "Community (G6)"): a rider puts up a ride on a saved trip; others
// ask to join; the host and co-hosts let them in, or the ride lets riders in itself while it has
// seats. Approved riders see the exact meeting point, the group's WhatsApp link and the
// ride-together room. Nobody outside the ride approves anything.

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

interface RideSqlRow extends Record<string, unknown> {
  id: string;
  title: string;
  about: string;
  starts_at: string | Date;
  meet_label: string;
  vehicle: string;
  pace: string;
  seats: number;
  needs: string[];
  visibility: string;
  join_policy: string;
  cancelled: boolean;
  trip_id: string;
  trip_vehicle: string;
  route_id: string | null;
  via_label: string | null;
  distance_m: number | null;
  duration_s: number | null;
  from_label: string | null;
  to_label: string | null;
  taken: number;
  host: string | null;
  club_id: string | null;
  club_slug: string | null;
  club_name: string | null;
}

const iso = (d: string | Date) => (d instanceof Date ? d : new Date(d)).toISOString();

const RIDE_SELECT = sql`
  SELECT g.id, g.title, g.about, g.starts_at, g.meet_label, g.vehicle, g.pace, g.seats, g.needs,
         g.visibility, g.join_policy, g.cancelled, g.trip_id, g.club_id,
         t.vehicle::text AS trip_vehicle, t.route_id, t.via_label, t.distance_m, t.duration_s,
         s.from_label, s.to_label,
         coalesce((SELECT sum(seats_taken) FROM group_ride_member
                   WHERE ride_id = g.id AND status = 'approved' AND role <> 'host'), 0)::int AS taken,
         (SELECT r.nickname FROM group_ride_member m JOIN rider r ON r.id = m.rider_id
          WHERE m.ride_id = g.id AND m.role = 'host' LIMIT 1) AS host,
         c.slug AS club_slug, c.name AS club_name
  FROM group_ride g
  JOIN trip t ON t.id = g.trip_id
  LEFT JOIN club c ON c.id = g.club_id
  CROSS JOIN LATERAL (
    SELECT (array_agg(label ORDER BY position))[1] AS from_label,
           (array_agg(label ORDER BY position DESC))[1] AS to_label
    FROM trip_stop WHERE trip_id = t.id
  ) s`;

export function rideState(
  r: { cancelled: boolean; startsAt: string; left: number },
  now = new Date(),
): GroupRideState {
  if (r.cancelled) return "cancelled";
  if (new Date(r.startsAt) <= now) return "past";
  return r.left > 0 ? "open" : "full";
}

function toSummary(r: RideSqlRow): GroupRideSummary {
  const startsAt = iso(r.starts_at);
  const left = Math.max(0, r.seats - r.taken);
  return {
    id: r.id,
    title: r.title,
    startsAt,
    meetLabel: r.meet_label,
    vehicle: r.vehicle as GroupRideSummary["vehicle"],
    pace: r.pace as GroupRideSummary["pace"],
    seats: r.seats,
    seatsLeft: left,
    from: r.from_label ?? "",
    to: r.to_label ?? "",
    distanceKm: r.distance_m === null ? null : r.distance_m / 1000,
    durationMin: r.duration_s === null ? null : Math.round(r.duration_s / 60),
    host: r.host ?? "",
    club: r.club_slug && r.club_name ? { slug: r.club_slug, name: r.club_name } : null,
    state: rideState({ cancelled: r.cancelled, startsAt, left }),
  };
}

async function rideRow(id: string, tx: Tx | Db = getDb()): Promise<RideSqlRow | null> {
  const [row] = await tx.execute<RideSqlRow>(sql`${RIDE_SELECT} WHERE g.id = ${id}`);
  return row ?? null;
}

const point = (p: LngLat | null) =>
  p ? sql`ST_SetSRID(ST_MakePoint(${p[0]}, ${p[1]}), 4326)::geography` : sql`NULL`;

/** Checks a start time: in the future and not more than MAX_DAYS_AHEAD away. */
function checkStart(startsAt: string, now: Date) {
  const t = new Date(startsAt).getTime();
  if (t <= now.getTime()) throw new CommunityError("Pick a start time in the future.", 400);
  if (t > now.getTime() + MAX_DAYS_AHEAD * 24 * 60 * 60_000) {
    throw new CommunityError(`Rides can be put up at most ${MAX_DAYS_AHEAD} days ahead.`, 400);
  }
}

/** Puts up a ride hosted by this rider. Returns its id. */
export async function createGroupRide(
  riderId: string,
  input: GroupRideInput,
  now = new Date(),
): Promise<string> {
  checkStart(input.startsAt, now);
  if (input.clubId) {
    const seat = await clubSeat(input.clubId, riderId);
    if (!canClub(seat, "host_ride")) {
      throw new CommunityError("Only the club's owner and admins can host its rides.", 403);
    }
  }
  return getDb().transaction(async (tx) => {
    const [trip] = await tx.execute<{ id: string }>(
      sql`SELECT id FROM trip WHERE id = ${input.tripId}`,
    );
    if (!trip) throw new CommunityError("Trip not found", 404);
    const [hosted] = await tx.execute<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM group_ride_member m JOIN group_ride g ON g.id = m.ride_id
      WHERE m.rider_id = ${riderId} AND m.role = 'host' AND NOT g.cancelled AND g.starts_at > now()`);
    if ((hosted?.n ?? 0) >= MAX_UPCOMING_HOSTED) {
      throw new CommunityError(`You can host up to ${MAX_UPCOMING_HOSTED} upcoming rides.`, 409);
    }
    const [row] = await tx.execute<{ id: string }>(sql`
      INSERT INTO group_ride (club_id, trip_id, title, about, starts_at, meet_label, meet_note,
                              meet_point, seats, vehicle, pace, needs, visibility, join_policy,
                              whatsapp_url, room_id)
      VALUES (${input.clubId}, ${input.tripId}, ${input.title}, ${input.about}, ${input.startsAt},
              ${input.meetLabel}, ${input.meetNote}, ${point(input.meetPoint)}, ${input.seats},
              ${input.vehicle}, ${input.pace},
              ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(input.needs)}::jsonb)),
              ${input.visibility}, ${input.joinPolicy}, ${input.whatsappUrl}, ${newRoomId()})
      RETURNING id`);
    await tx.execute(sql`
      INSERT INTO group_ride_member (ride_id, rider_id, role, status, decided_at)
      VALUES (${row!.id}, ${riderId}, 'host', 'approved', now())`);
    return row!.id;
  });
}

/** This rider's seat on the ride, or null. */
export async function rideSeat(rideId: string, riderId: string | null): Promise<RideSeat | null> {
  if (!riderId) return null;
  const [row] = await getDb().execute<{ role: RideRole; status: RideStatus }>(sql`
    SELECT role, status FROM group_ride_member WHERE ride_id = ${rideId} AND rider_id = ${riderId}`);
  return row ?? null;
}

interface MemberSqlRow extends Record<string, unknown> {
  rider_id: string;
  nickname: string;
  role: RideRole;
  status: RideStatus;
  note: string;
  seats_taken: number;
  at: string | Date;
}

async function memberRows(rideId: string, statuses: RideStatus[]): Promise<RideMemberRow[]> {
  const rows = await getDb().execute<MemberSqlRow>(sql`
    SELECT m.rider_id, r.nickname, m.role, m.status, m.note, m.seats_taken,
           coalesce(m.decided_at, m.created_at) AS at
    FROM group_ride_member m JOIN rider r ON r.id = m.rider_id
    WHERE m.ride_id = ${rideId}
      AND m.status IN (SELECT jsonb_array_elements_text(${JSON.stringify(statuses)}::jsonb))
    ORDER BY array_position(ARRAY['host', 'cohost', 'rider'], m.role), m.created_at
    LIMIT 200`);
  return rows.map((r) => ({
    riderId: r.rider_id,
    nickname: r.nickname,
    role: r.role,
    status: r.status,
    note: r.note,
    pillion: r.seats_taken > 1,
    at: iso(r.at),
  }));
}

/** The public part of a ride, with its route line. */
async function toPublic(r: RideSqlRow): Promise<GroupRidePublic> {
  return {
    ...toSummary(r),
    about: r.about,
    needs: r.needs as GroupRidePublic["needs"],
    visibility: r.visibility as GroupRidePublic["visibility"],
    joinPolicy: r.join_policy as GroupRidePublic["joinPolicy"],
    tripId: r.trip_id,
    tripVehicle: r.trip_vehicle as Vehicle,
    viaLabel: r.via_label,
    line: await getTripLine(r.trip_id),
  };
}

/**
 * The public part of a ride that anyone with its page may see (public and link-only rides), for
 * the server-rendered page and its share card. Null for members-only rides and unknown ids.
 */
export async function openGroupRide(id: string): Promise<GroupRidePublic | null> {
  const row = await rideRow(id);
  if (!row || row.visibility === "club") return null;
  return toPublic(row);
}

/** Whether a ride with this id exists, and the club of a members-only one. */
export async function rideExists(id: string) {
  const row = await rideRow(id);
  return row
    ? {
        visibility: row.visibility,
        club: row.club_slug && row.club_name ? { slug: row.club_slug, name: row.club_name } : null,
      }
    : null;
}

/** The ride as this viewer may see it; null for an unknown id. */
export async function groupRideView(
  id: string,
  riderId: string | null,
): Promise<GroupRideView | null> {
  const row = await rideRow(id);
  if (!row) return null;
  const seat = await rideSeat(id, riderId);
  const clubSeatOf: ClubSeat | null = row.club_id ? await clubSeat(row.club_id, riderId) : null;
  const club = row.club_slug && row.club_name ? { slug: row.club_slug, name: row.club_name } : null;
  const visibility = row.visibility as GroupRidePublic["visibility"];
  const view: GroupRideView = {
    ride: canSeeRide(visibility, clubSeatOf, seat) ? await toPublic(row) : null,
    club,
    me: riderId ? { riderId, seat, clubSeat: clubSeatOf } : null,
  };
  if (view.ride && canRide(seat, "view_private")) {
    const [extra] = await getDb().execute<{
      meet_note: string;
      lng: number | null;
      lat: number | null;
      whatsapp_url: string | null;
      room_id: string;
    }>(sql`
      SELECT meet_note, ST_X(meet_point::geometry) AS lng, ST_Y(meet_point::geometry) AS lat,
             whatsapp_url, room_id
      FROM group_ride WHERE id = ${id}`);
    view.private = {
      meetNote: extra!.meet_note,
      meetPoint: extra!.lng === null || extra!.lat === null ? null : [extra!.lng, extra!.lat],
      whatsappUrl: extra!.whatsapp_url,
      roomPath: rideRoomPath(extra!.room_id, { routeId: row.route_id, title: row.title }),
      riders: await memberRows(id, ["approved"]),
    };
    if (canRide(seat, "manage_riders")) {
      view.requests = await memberRows(id, ["pending", "waitlist"]);
    }
  }
  return view;
}

/** Locks the ride and reads its seats, so two approvals cannot both take the last seat. */
async function lockSeats(tx: Tx, rideId: string) {
  const [ride] = await tx.execute<{
    seats: number;
    join_policy: string;
    visibility: string;
    club_id: string | null;
    needs: string[];
    cancelled: boolean;
    starts_at: string | Date;
  }>(sql`
    SELECT seats, join_policy, visibility, club_id, needs, cancelled, starts_at
    FROM group_ride WHERE id = ${rideId} FOR UPDATE`);
  if (!ride) throw new CommunityError("Ride not found", 404);
  const holders = await tx.execute<{
    rider_id: string;
    role: RideRole;
    status: RideStatus;
    seats_taken: number;
    created_at: string | Date;
  }>(sql`
    SELECT rider_id, role, status, seats_taken, created_at
    FROM group_ride_member WHERE ride_id = ${rideId}`);
  const rows: SeatHolder[] = holders.map((h) => ({
    riderId: h.rider_id,
    role: h.role,
    status: h.status,
    seatsTaken: h.seats_taken,
    createdAt: iso(h.created_at),
  }));
  return { ride, rows };
}

/** On an open ride, lets waitlisted riders in while seats are free. */
async function fillFromWaitlist(tx: Tx, rideId: string) {
  const { ride, rows } = await lockSeats(tx, rideId);
  if (ride.join_policy !== "open") return;
  const ids = promoteFromWaitlist(seatsLeft(ride.seats, rows), rows);
  if (ids.length === 0) return;
  await tx.execute(sql`
    UPDATE group_ride_member SET status = 'approved', decided_at = now()
    WHERE ride_id = ${rideId}
      AND rider_id IN (SELECT jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb)::uuid)`);
}

/**
 * A rider asks to join. On an open ride they are in straight away while it has seats, else on the
 * waitlist; otherwise the request waits for the host. Asking again after leaving or being
 * declined is a new request; a removed rider stays out.
 */
export async function requestToJoin(
  rideId: string,
  riderId: string,
  input: JoinRequestInput,
  now = new Date(),
): Promise<RideStatus> {
  return getDb().transaction(async (tx) => {
    const { ride, rows } = await lockSeats(tx, rideId);
    if (ride.cancelled) throw new CommunityError("This ride is called off.", 409);
    if (new Date(iso(ride.starts_at)) <= now)
      throw new CommunityError("This ride has started.", 409);
    if (ride.visibility === "club") {
      const seat = await clubSeatTx(tx, ride.club_id!, riderId);
      if (seat?.status !== "active") {
        throw new CommunityError("This ride is for the club's members.", 403);
      }
    }
    if (input.pillion && !ride.needs.includes("pillion_ok")) {
      throw new CommunityError("This ride does not take pillions.", 400);
    }
    const mine = rows.find((r) => r.riderId === riderId);
    if (mine?.status === "removed") throw new CommunityError("You can't join this ride.", 403);
    if (mine && ["pending", "approved", "waitlist"].includes(mine.status)) return mine.status;
    const want = input.pillion ? 2 : 1;
    const status = newRequestStatus(
      ride.join_policy as "approval" | "open",
      seatsLeft(ride.seats, rows),
      want,
    );
    await tx.execute(sql`
      INSERT INTO group_ride_member (ride_id, rider_id, role, status, note, seats_taken, decided_at)
      VALUES (${rideId}, ${riderId}, 'rider', ${status}, ${input.note}, ${want},
              ${status === "approved" ? sql`now()` : sql`NULL`})
      ON CONFLICT (ride_id, rider_id) DO UPDATE SET
        role = 'rider', status = excluded.status, note = excluded.note,
        seats_taken = excluded.seats_taken, decided_at = excluded.decided_at, created_at = now()`);
    return status;
  });
}

async function clubSeatTx(tx: Tx, clubId: string, riderId: string): Promise<ClubSeat | null> {
  const [row] = await tx.execute<{ role: ClubSeat["role"]; status: ClubSeat["status"] }>(sql`
    SELECT role, status FROM club_member WHERE club_id = ${clubId} AND rider_id = ${riderId}`);
  return row ?? null;
}

/** A rider leaves the ride or takes back their request. The host calls the ride off instead. */
export async function leaveRide(rideId: string, riderId: string): Promise<void> {
  await getDb().transaction(async (tx) => {
    const [seat] = await tx.execute<{ role: RideRole; status: RideStatus }>(sql`
      SELECT role, status FROM group_ride_member WHERE ride_id = ${rideId} AND rider_id = ${riderId}`);
    if (!seat) return;
    if (seat.role === "host") throw new CommunityError("Call the ride off instead.", 409);
    if (!["pending", "approved", "waitlist"].includes(seat.status)) return;
    await tx.execute(sql`
      UPDATE group_ride_member SET status = 'left', role = 'rider', decided_at = now()
      WHERE ride_id = ${rideId} AND rider_id = ${riderId}`);
    if (seat.status === "approved") await fillFromWaitlist(tx, rideId);
  });
}

/** The host or a co-host acts on a rider or a request, as roles.ts allows. */
export async function actOnRideMember(
  rideId: string,
  actorId: string,
  targetId: string,
  action: RideMemberAction,
): Promise<void> {
  await getDb().transaction(async (tx) => {
    const { ride, rows } = await lockSeats(tx, rideId);
    const actor = rows.find((r) => r.riderId === actorId) ?? null;
    const target = rows.find((r) => r.riderId === targetId);
    if (!target) throw new CommunityError("Not a rider or request on this ride", 404);
    if (!canActOnRideMember(actor, target, actorId === targetId)) {
      throw new CommunityError("You can't do that on this ride.", 403);
    }
    const set = (fields: SQL) =>
      tx.execute(sql`
        UPDATE group_ride_member SET ${fields}, decided_at = now()
        WHERE ride_id = ${rideId} AND rider_id = ${targetId}`);
    const wasIn = target.status === "approved";
    switch (action) {
      case "approve": {
        if (!["pending", "waitlist"].includes(target.status)) {
          throw new CommunityError("No request to approve", 409);
        }
        if (target.seatsTaken > seatsLeft(ride.seats, rows)) {
          throw new CommunityError("No seats left. Add seats or waitlist them.", 409);
        }
        await set(sql`status = 'approved'`);
        return;
      }
      case "waitlist":
        if (!["pending", "approved"].includes(target.status)) {
          throw new CommunityError("Only requests and riders go on the waitlist", 409);
        }
        await set(sql`status = 'waitlist', role = 'rider'`);
        break;
      case "decline":
        if (!["pending", "waitlist"].includes(target.status)) {
          throw new CommunityError("No request to decline", 409);
        }
        await set(sql`status = 'declined'`);
        return;
      case "remove":
        await set(sql`status = 'removed', role = 'rider'`);
        break;
      case "make_cohost":
      case "make_rider":
        if (!canRide(actor, "set_cohosts")) {
          throw new CommunityError("Only the host can pick co-hosts.", 403);
        }
        if (!wasIn) throw new CommunityError("Only riders on the ride can be co-hosts", 409);
        await set(sql`role = ${action === "make_cohost" ? "cohost" : "rider"}`);
        return;
    }
    if (wasIn) await fillFromWaitlist(tx, rideId);
  });
}

/** The host or a co-host changes the ride; only the host calls it off. */
export async function updateGroupRide(
  rideId: string,
  riderId: string,
  update: GroupRideUpdate,
  now = new Date(),
): Promise<void> {
  const seat = await rideSeat(rideId, riderId);
  if (!canRide(seat, "edit"))
    throw new CommunityError("Only the host and co-hosts can change the ride.", 403);
  if (update.cancelled !== undefined && !canRide(seat, "cancel")) {
    throw new CommunityError("Only the host can call the ride off.", 403);
  }
  if (update.startsAt) checkStart(update.startsAt, now);
  const set: SQL[] = [];
  if (update.title !== undefined) set.push(sql`title = ${update.title}`);
  if (update.about !== undefined) set.push(sql`about = ${update.about}`);
  if (update.startsAt !== undefined) set.push(sql`starts_at = ${update.startsAt}`);
  if (update.meetLabel !== undefined) set.push(sql`meet_label = ${update.meetLabel}`);
  if (update.meetNote !== undefined) set.push(sql`meet_note = ${update.meetNote}`);
  if (update.meetPoint !== undefined) set.push(sql`meet_point = ${point(update.meetPoint)}`);
  if (update.seats !== undefined) set.push(sql`seats = ${update.seats}`);
  if (update.pace !== undefined) set.push(sql`pace = ${update.pace}`);
  if (update.needs !== undefined) {
    set.push(
      sql`needs = ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(update.needs)}::jsonb))`,
    );
  }
  if (update.joinPolicy !== undefined) set.push(sql`join_policy = ${update.joinPolicy}`);
  if (update.whatsappUrl !== undefined) set.push(sql`whatsapp_url = ${update.whatsappUrl}`);
  if (update.cancelled !== undefined) set.push(sql`cancelled = ${update.cancelled}`);
  if (set.length === 0) return;
  await getDb().transaction(async (tx) => {
    await tx.execute(sql`
      UPDATE group_ride SET ${sql.join(set, sql`, `)}, updated_at = now() WHERE id = ${rideId}`);
    // More seats, or a ride that became open, lets the waitlist in.
    if (update.seats !== undefined || update.joinPolicy !== undefined) {
      await fillFromWaitlist(tx, rideId);
    }
  });
}

/** Public rides that have not started, soonest first; near a start point when one is given. */
export async function listGroupRides(opts: {
  near?: LngLat;
  month?: number;
  vehicle?: "bike" | "car";
  limit?: number;
}): Promise<GroupRideSummary[]> {
  const near = opts.near;
  const rows = await getDb().execute<RideSqlRow>(sql`
    ${RIDE_SELECT}
    WHERE g.visibility = 'public' AND NOT g.cancelled AND g.starts_at > now()
      ${opts.month ? sql`AND extract(month FROM g.starts_at AT TIME ZONE 'Asia/Kolkata') = ${opts.month}` : sql``}
      ${opts.vehicle ? sql`AND g.vehicle IN (${opts.vehicle}, 'any')` : sql``}
      ${
        near
          ? sql`AND EXISTS (SELECT 1 FROM trip_stop ts WHERE ts.trip_id = g.trip_id AND ts.position = 0
                AND ST_DWithin(ts.location, ${point(near)}, 150000))`
          : sql``
      }
    ORDER BY g.starts_at
    LIMIT ${opts.limit ?? 50}`);
  return rows.map(toSummary);
}

/** A club's rides that have not started: members see members-only ones too. */
export async function clubRides(clubId: string, members: boolean): Promise<GroupRideSummary[]> {
  const rows = await getDb().execute<RideSqlRow>(sql`
    ${RIDE_SELECT}
    WHERE g.club_id = ${clubId} AND NOT g.cancelled AND g.starts_at > now()
      ${members ? sql`` : sql`AND g.visibility = 'public'`}
    ORDER BY g.starts_at
    LIMIT 50`);
  return rows.map(toSummary);
}

/** The rides this rider hosts, rides with or asked to join, from two days ago on, for /me. */
export async function ridesOf(riderId: string) {
  const rows = await getDb().execute<RideSqlRow & { role: RideRole; status: RideStatus }>(sql`
    ${RIDE_SELECT}
    JOIN group_ride_member me ON me.ride_id = g.id AND me.rider_id = ${riderId}
    WHERE g.starts_at > now() - interval '2 days'
      AND me.status IN ('pending', 'approved', 'waitlist', 'declined')
    ORDER BY g.starts_at
    LIMIT 100`);
  // RIDE_SELECT's columns do not include the member's; read them apart.
  const seats = await getDb().execute<{ ride_id: string; role: RideRole; status: RideStatus }>(sql`
    SELECT ride_id, role, status FROM group_ride_member WHERE rider_id = ${riderId}`);
  const byRide = new Map(seats.map((s) => [s.ride_id, s]));
  return rows.map((r) => ({
    ...toSummary(r),
    role: byRide.get(r.id)?.role ?? "rider",
    status: byRide.get(r.id)?.status ?? "pending",
  }));
}

/** Requests waiting on rides this rider hosts or co-hosts that have not started. */
export async function waitingRideRequests(riderId: string): Promise<number> {
  const [row] = await getDb().execute<{ n: number }>(sql`
    SELECT count(*)::int AS n
    FROM group_ride_member req
    JOIN group_ride_member me ON me.ride_id = req.ride_id
    JOIN group_ride g ON g.id = req.ride_id
    WHERE me.rider_id = ${riderId} AND me.status = 'approved' AND me.role IN ('host', 'cohost')
      AND req.status = 'pending' AND NOT g.cancelled AND g.starts_at > now()`);
  return row?.n ?? 0;
}

/** Decisions on this rider's ride requests since `since` (not their own leaving). */
export async function decidedRideRequests(riderId: string, since: Date): Promise<number> {
  const [row] = await getDb().execute<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM group_ride_member
    WHERE rider_id = ${riderId} AND role <> 'host' AND status IN ('approved', 'declined', 'removed', 'waitlist')
      AND decided_at > created_at AND decided_at > ${since.toISOString()}`);
  return row?.n ?? 0;
}

/** Platform admins only: removes a ride (a legal takedown). */
export async function takeDownRide(id: string): Promise<boolean> {
  const rows = await getDb().execute(sql`DELETE FROM group_ride WHERE id = ${id} RETURNING id`);
  return rows.length > 0;
}

/** Daily clean-up: riders' notes to hosts go 30 days after the ride. */
export async function forgetOldRideNotes(): Promise<number> {
  const rows = await getDb().execute(sql`
    UPDATE group_ride_member m SET note = ''
    FROM group_ride g
    WHERE g.id = m.ride_id AND m.note <> '' AND g.starts_at < now() - interval '30 days'
    RETURNING m.ride_id`);
  return rows.length;
}
