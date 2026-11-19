"use client";

import Link from "next/link";
import { useMemo } from "react";
import { badgesFor, type BadgeRide } from "@/lib/badges";
import { card, muted, primaryButton } from "./ui";
import { useRideMarks } from "./useRideMarks";

/**
 * The rider's bucket-list progress on Me: how many famous rides are done and wanted, the badges
 * earned, and the next one to work towards. Hidden when there are no rides to count.
 */
export function RideProgress({ rides }: { rides: BadgeRide[] }) {
  const { marks, loading } = useRideMarks();
  const known = useMemo(() => new Set(rides.map((r) => r.slug)), [rides]);
  const done = Object.values(marks).filter((m) => m.status === "done" && known.has(m.rideSlug));
  const wanted = Object.values(marks).filter(
    (m) => m.status === "pending" && known.has(m.rideSlug),
  ).length;
  const badges = useMemo(
    () =>
      badgesFor(
        rides,
        done.map((m) => m.rideSlug),
      ),
    [rides, done],
  );
  if (rides.length === 0) return null;

  const earned = badges.filter((b) => b.earned);
  // The closest badge not yet earned: the one with the most done towards it.
  const next = badges.filter((b) => !b.earned).sort((a, b) => b.have / b.need - a.have / a.need)[0];

  return (
    <section aria-label="Your ride bucket list" className={`${card} flex flex-col gap-3`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-xl font-bold">Your ride bucket list</h2>
        <Link href="/bucket-list" className={primaryButton}>
          Open my bucket list
        </Link>
      </div>
      {loading ? (
        <p className={muted}>Loading…</p>
      ) : (
        <>
          <p>
            <span className="tabular font-mono text-lg font-bold">{done.length}</span> of{" "}
            <span className="tabular font-mono text-lg font-bold">{rides.length}</span> famous rides
            done
            {wanted > 0 && (
              <>
                {" · "}
                <span className="tabular font-mono font-bold">{wanted}</span> to ride
              </>
            )}
          </p>
          {earned.length > 0 ? (
            <ul aria-label="Badges earned" className="flex flex-wrap gap-2">
              {earned.map((b) => (
                <li
                  key={b.id}
                  title={b.description}
                  className="bg-marigold-tint rounded-full px-3 py-1 text-sm font-bold text-stone-900 dark:bg-amber-950 dark:text-amber-100"
                >
                  <span aria-hidden>★ </span>
                  {b.title}
                </li>
              ))}
            </ul>
          ) : (
            <p className={muted}>Mark a ride as done to earn your first badge.</p>
          )}
          {next && (
            <p className={`${muted} text-sm`}>
              Next: {next.title}, <span className="tabular font-mono">{next.have}</span> of{" "}
              <span className="tabular font-mono">{next.need}</span>.
            </p>
          )}
        </>
      )}
    </section>
  );
}
