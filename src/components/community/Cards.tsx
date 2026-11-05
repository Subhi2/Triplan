import Link from "next/link";
import { formatDuration, formatKm } from "@/lib/format";
import {
  CLUB_ROLE_LABELS,
  RIDE_ROLE_LABELS,
  type ClubRole,
  type ClubStatus,
  type RideRole,
  type RideStatus,
} from "@/lib/community/roles";
import {
  CLUB_JOIN_LABELS,
  COMMUNITY_VEHICLE_LABELS,
  RIDE_PACE_LABELS,
} from "@/lib/community/schemas";
import { formatRideTime } from "@/lib/community/shareText";
import type { ClubSummary, GroupRideState, GroupRideSummary } from "@/lib/community/views";
import { card, muted } from "./ui";

const STATE_LABELS: Record<GroupRideState, string> = {
  open: "Seats open",
  full: "Full · waitlist",
  cancelled: "Called off",
  past: "Ridden",
};

const RIDE_STATUS_LABELS: Record<RideStatus, string> = {
  pending: "Asked to join",
  approved: "You're in",
  waitlist: "On the waitlist",
  declined: "Not this time",
  left: "Left",
  removed: "Removed",
};

const CLUB_STATUS_LABELS: Record<ClubStatus, string> = {
  pending: "Asked to join",
  active: "Member",
  blocked: "Blocked",
};

/** "Seats open" in teal, "Full" and "Called off" in the warning colour. */
export function RideStateChip({ state, seatsLeft }: { state: GroupRideState; seatsLeft: number }) {
  const tone =
    state === "open"
      ? "bg-brand-tint text-brand-dark dark:bg-teal-950 dark:text-teal-200"
      : state === "past"
        ? "bg-stone-100 dark:bg-stone-800"
        : "bg-marigold-tint text-ghat-dark dark:bg-orange-950 dark:text-orange-200";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${tone}`}
    >
      {state === "open" ? (
        <>
          <span className="tabular mr-1 font-mono">{seatsLeft}</span>
          {seatsLeft === 1 ? "seat left" : "seats left"}
        </>
      ) : (
        STATE_LABELS[state]
      )}
    </span>
  );
}

/** A group ride in a list: when, where from, the road, seats, and the viewer's place on it. */
export function GroupRideCard({
  ride,
  seat,
}: {
  ride: GroupRideSummary;
  seat?: { role: RideRole; status: RideStatus };
}) {
  return (
    <Link
      href={`/group-rides/${ride.id}`}
      data-group-ride={ride.id}
      className={`${card} group flex flex-col gap-2 hover:border-stone-400`}
    >
      <span className="tabular text-brand-dark font-mono text-sm font-semibold dark:text-teal-300">
        {formatRideTime(ride.startsAt)}
      </span>
      <span className="font-display text-lg leading-tight font-bold group-hover:underline">
        {ride.title}
      </span>
      <span className={`text-sm ${muted}`}>
        {ride.from} → {ride.to} · meet in {ride.meetLabel}
      </span>
      <span className="tabular flex flex-wrap gap-x-3 font-mono text-sm">
        {ride.distanceKm !== null && <span>{formatKm(ride.distanceKm * 1000)}</span>}
        {ride.durationMin !== null && <span>{formatDuration(ride.durationMin)}</span>}
      </span>
      <span className={`text-sm ${muted}`}>
        {COMMUNITY_VEHICLE_LABELS[ride.vehicle]} · {RIDE_PACE_LABELS[ride.pace]} pace · hosted by{" "}
        <span className="font-bold text-stone-900 dark:text-stone-100">{ride.host}</span>
        {ride.club && <> · {ride.club.name}</>}
      </span>
      <span className="mt-auto flex flex-wrap items-center gap-2">
        <RideStateChip state={ride.state} seatsLeft={ride.seatsLeft} />
        {seat && (
          <span className="rounded-full bg-stone-900 px-2.5 py-0.5 text-xs font-bold text-white dark:bg-stone-100 dark:text-stone-900">
            {seat.role === "rider" ? RIDE_STATUS_LABELS[seat.status] : RIDE_ROLE_LABELS[seat.role]}
          </span>
        )}
      </span>
    </Link>
  );
}

/** A club in a list: name, home, who it is for, members and coming rides. */
export function ClubCard({
  club,
  seat,
}: {
  club: ClubSummary;
  seat?: { role: ClubRole; status: ClubStatus };
}) {
  return (
    <Link
      href={`/clubs/${club.slug}`}
      data-club={club.slug}
      className={`${card} group flex flex-col gap-1.5 hover:border-stone-400`}
    >
      <span className="font-display text-lg leading-tight font-bold group-hover:underline">
        {club.name}
      </span>
      <span className={`text-sm ${muted}`}>
        {club.homeLabel} · {COMMUNITY_VEHICLE_LABELS[club.vehicle]} ·{" "}
        {CLUB_JOIN_LABELS[club.joinPolicy]}
      </span>
      <span className="tabular flex flex-wrap gap-x-3 font-mono text-sm">
        <span>
          {club.members} {club.members === 1 ? "member" : "members"}
        </span>
        <span>
          {club.upcomingRides} {club.upcomingRides === 1 ? "ride coming" : "rides coming"}
        </span>
      </span>
      {seat && (
        <span className="mt-1 self-start rounded-full bg-stone-900 px-2.5 py-0.5 text-xs font-bold text-white dark:bg-stone-100 dark:text-stone-900">
          {seat.status === "active" ? CLUB_ROLE_LABELS[seat.role] : CLUB_STATUS_LABELS[seat.status]}
        </span>
      )}
    </Link>
  );
}
