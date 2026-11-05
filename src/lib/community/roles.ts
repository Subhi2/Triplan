// Who may do what in clubs and group rides (docs/02, "Community (G6)"). Pure: the one place the
// rules live, used by the server before every change and by the pages to show the right buttons.
// There is no supervisor: clubs and rides are run by their own owners, admins and hosts.

export const CLUB_ROLES = ["owner", "admin", "member"] as const;
export type ClubRole = (typeof CLUB_ROLES)[number];
export const CLUB_STATUSES = ["pending", "active", "blocked"] as const;
export type ClubStatus = (typeof CLUB_STATUSES)[number];

export const RIDE_ROLES = ["host", "cohost", "rider"] as const;
export type RideRole = (typeof RIDE_ROLES)[number];
export const RIDE_STATUSES = [
  "pending",
  "approved",
  "waitlist",
  "declined",
  "left",
  "removed",
] as const;
export type RideStatus = (typeof RIDE_STATUSES)[number];

export const CLUB_ROLE_LABELS: Record<ClubRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};
export const RIDE_ROLE_LABELS: Record<RideRole, string> = {
  host: "Host",
  cohost: "Co-host",
  rider: "Rider",
};

/** A rider's place in a club or ride, or null when they have none. */
export interface ClubSeat {
  role: ClubRole;
  status: ClubStatus;
}
export interface RideSeat {
  role: RideRole;
  status: RideStatus;
}

export type ClubAction =
  /** The members list, the WhatsApp link and members-only rides. */
  | "view_private"
  /** Approve, decline, remove and block members. */
  | "manage_members"
  /** Make members admins and admins members. */
  | "set_admins"
  | "edit"
  | "reset_invite"
  | "host_ride"
  | "transfer"
  | "delete";

const CLUB_RIGHTS: Record<ClubRole, readonly ClubAction[]> = {
  owner: [
    "view_private",
    "manage_members",
    "set_admins",
    "edit",
    "reset_invite",
    "host_ride",
    "transfer",
    "delete",
  ],
  admin: ["view_private", "manage_members", "edit", "reset_invite", "host_ride"],
  member: ["view_private"],
};

export type RideAction =
  /** The exact meeting point, the WhatsApp link and the ride-together room. */
  | "view_private"
  /** Approve, waitlist, decline and remove riders. */
  | "manage_riders"
  | "set_cohosts"
  | "edit"
  | "cancel";

const RIDE_RIGHTS: Record<RideRole, readonly RideAction[]> = {
  host: ["view_private", "manage_riders", "set_cohosts", "edit", "cancel"],
  cohost: ["view_private", "manage_riders", "edit"],
  rider: ["view_private"],
};

/** Whether a rider with this seat may do this in the club. Only active members have rights. */
export function canClub(seat: ClubSeat | null, action: ClubAction): boolean {
  return seat?.status === "active" && CLUB_RIGHTS[seat.role].includes(action);
}

/** Whether a rider with this seat may do this on the ride. Only approved riders have rights. */
export function canRide(seat: RideSeat | null, action: RideAction): boolean {
  return seat?.status === "approved" && RIDE_RIGHTS[seat.role].includes(action);
}

/**
 * Whether `actor` may act on `target` in a club: the owner on anyone but themselves, an admin on
 * members and requests only (never on the owner or another admin).
 */
export function canActOnClubMember(actor: ClubSeat | null, target: ClubSeat, self: boolean) {
  if (self || !canClub(actor, "manage_members")) return false;
  if (actor!.role === "owner") return true;
  return target.role === "member";
}

/** Whether `actor` may act on `target` on a ride: the host on anyone else, a co-host on riders. */
export function canActOnRideMember(actor: RideSeat | null, target: RideSeat, self: boolean) {
  if (self || target.role === "host" || !canRide(actor, "manage_riders")) return false;
  if (actor!.role === "host") return true;
  return target.role === "rider";
}

/**
 * Whether a viewer may see a ride at all: public and link-only rides are open to anyone with the
 * page; a members-only ride to the club's active members and to the ride's own riders.
 */
export function canSeeRide(
  visibility: "public" | "club" | "link",
  club: ClubSeat | null,
  ride: RideSeat | null,
): boolean {
  if (visibility !== "club") return true;
  return club?.status === "active" || (ride !== null && ride.status !== "removed");
}
