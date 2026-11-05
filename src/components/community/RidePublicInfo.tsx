import Link from "next/link";
import { RouteSketch } from "@/components/ride/RouteSketch";
import { formatDuration, formatKm } from "@/lib/format";
import {
  COMMUNITY_VEHICLE_LABELS,
  RIDE_NEED_LABELS,
  RIDE_PACE_LABELS,
} from "@/lib/community/schemas";
import { formatRideTime } from "@/lib/community/shareText";
import type { GroupRidePublic } from "@/lib/community/views";
import { RideStateChip } from "./Cards";
import { muted, secondaryButton } from "./ui";

/** A fact tile: label muted, value large in mono. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col rounded-xl bg-(--surface) p-3 dark:bg-stone-900">
      <span className={`text-xs font-bold uppercase ${muted}`}>{label}</span>
      <span className="tabular font-mono text-lg font-semibold">{value}</span>
    </div>
  );
}

/**
 * What anyone who may see a group ride sees: when, the road, where riders meet (the area only),
 * seats, who hosts, and what riders need. Rendered on the server for public and link-only rides,
 * and in the browser for a members-only ride once the viewer is known to be a member.
 */
export function RidePublicInfo({ ride }: { ride: GroupRidePublic }) {
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <p className="tabular text-brand-dark font-mono text-sm font-semibold dark:text-teal-300">
          {formatRideTime(ride.startsAt)} · meet in {ride.meetLabel}
        </p>
        <h1 className="font-display text-3xl font-extrabold tracking-tight md:text-4xl">
          {ride.title}
        </h1>
        <p className={muted}>
          {ride.from} → {ride.to}
          {ride.viaLabel && <> · {ride.viaLabel}</>}
        </p>
        <p className="text-sm">
          Hosted by <span className="font-bold">{ride.host}</span>
          {ride.club && (
            <>
              {" "}
              for{" "}
              <Link
                href={`/clubs/${ride.club.slug}`}
                className="text-brand-dark font-bold hover:underline dark:text-teal-300"
              >
                {ride.club.name}
              </Link>
            </>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <RideStateChip state={ride.state} seatsLeft={ride.seatsLeft} />
          <span className={`text-sm ${muted}`}>
            <span className="tabular font-mono">{ride.seats}</span> seats ·{" "}
            {ride.joinPolicy === "open"
              ? "riders get in while seats last"
              : "the host approves each rider"}
          </span>
        </div>
      </header>
      {ride.line.length > 1 && (
        <RouteSketch
          line={ride.line}
          className="bg-brand-tint h-44 w-full rounded-2xl dark:bg-teal-950"
        />
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {ride.distanceKm !== null && (
          <Fact label="Distance" value={formatKm(ride.distanceKm * 1000)} />
        )}
        {ride.durationMin !== null && (
          <Fact label="Riding" value={formatDuration(ride.durationMin)} />
        )}
        <Fact label="Pace" value={RIDE_PACE_LABELS[ride.pace]} />
        <Fact label="For" value={COMMUNITY_VEHICLE_LABELS[ride.vehicle]} />
      </div>
      {ride.needs.length > 0 && (
        <p className="text-sm">
          <span className="font-bold">Riders need:</span>{" "}
          {ride.needs.map((n) => RIDE_NEED_LABELS[n]).join(" · ")}
        </p>
      )}
      {ride.about && <p className="whitespace-pre-line">{ride.about}</p>}
      <Link href={`/trips/${ride.tripId}`} className={`${secondaryButton} self-start`}>
        See the road and its stops in the planner
      </Link>
    </div>
  );
}
