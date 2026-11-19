"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { NicknamePrompt, RiderProvider } from "@/components/community/RiderGate";
import { useRideMarks } from "@/components/community/useRideMarks";
import { card, chip, chipOff, chipOn, muted, secondaryButton } from "@/components/community/ui";
import { badgesFor } from "@/lib/badges";
import { rideArea, RIDE_AREAS, type RideArea, type RideSummary } from "@/lib/rides";
import { RouteSketch } from "./RouteSketch";

type Show = "all" | "pending" | "done" | "legend";
const SHOWS: { key: Show; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Want to ride" },
  { key: "done", label: "Done" },
  { key: "legend", label: "Legends" },
];

/** Every famous ride with the rider's own Done / Want-to-ride marks and how far they have got. */
export function BucketList({ rides }: { rides: RideSummary[] }) {
  return (
    <RiderProvider>
      <BucketListBody rides={rides} />
    </RiderProvider>
  );
}

function BucketListBody({ rides }: { rides: RideSummary[] }) {
  const { me, marks, loading, save, remove } = useRideMarks();
  const [show, setShow] = useState<Show>("all");
  const [area, setArea] = useState<RideArea | null>(null);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const areas = useMemo(
    () => RIDE_AREAS.filter((a) => rides.some((r) => rideArea(r.region) === a)),
    [rides],
  );
  const done = rides.filter((r) => marks[r.slug]?.status === "done").length;
  const badges = useMemo(
    () =>
      badgesFor(
        rides,
        Object.values(marks)
          .filter((m) => m.status === "done")
          .map((m) => m.rideSlug),
      ),
    [rides, marks],
  );
  const pct = rides.length ? Math.round((done / rides.length) * 100) : 0;
  const shown = rides.filter(
    (r) =>
      (show === "all" ||
        (show === "legend" ? r.tier === "legend" : marks[r.slug]?.status === show)) &&
      (area === null || rideArea(r.region) === area),
  );

  async function toggle(slug: string, status: "pending" | "done") {
    setError(null);
    try {
      if (marks[slug]?.status === status) await remove(slug);
      else await save({ rideSlug: slug, status, doneOn: null, note: "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save. Try again.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <section aria-label="Your progress" className={`${card} flex flex-col gap-2`}>
        <p className="font-display text-xl font-bold">
          <span className="tabular font-mono">{done}</span> of{" "}
          <span className="tabular font-mono">{rides.length}</span> rides done
        </p>
        <div
          role="progressbar"
          aria-label="Rides done"
          aria-valuemin={0}
          aria-valuemax={rides.length}
          aria-valuenow={done}
          className="h-3 w-full overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800"
        >
          <div className="bg-brand h-full rounded-full" style={{ width: `${pct}%` }} />
        </div>
        {me && (
          <ul aria-label="Badges" className="flex flex-wrap gap-2 pt-1">
            {badges.map((b) => (
              <li
                key={b.id}
                title={b.description}
                className={`rounded-full px-3 py-1 text-sm ${
                  b.earned
                    ? "bg-marigold-tint font-bold text-stone-900 dark:bg-amber-950 dark:text-amber-100"
                    : "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400"
                }`}
              >
                {b.earned && <span aria-hidden>★ </span>}
                {b.title}
                {!b.earned && (
                  <span className="tabular font-mono">
                    {" "}
                    {b.have}/{b.need}
                  </span>
                )}
                <span className="sr-only">{b.earned ? ", earned" : ", not yet"}</span>
              </li>
            ))}
          </ul>
        )}
        {!me && !loading && (
          <div className="flex flex-col gap-2">
            <p className={muted}>
              Make a nickname on this device to mark rides as done or as ones you want to ride.
            </p>
            {asking ? (
              <NicknamePrompt
                why="to keep your bucket list"
                onCancel={() => setAsking(false)}
                onReady={() => setAsking(false)}
              />
            ) : (
              <button type="button" onClick={() => setAsking(true)} className={secondaryButton}>
                Start my bucket list
              </button>
            )}
          </div>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter rides">
        {SHOWS.map((s) => (
          <button
            key={s.key}
            type="button"
            aria-pressed={show === s.key}
            onClick={() => setShow(s.key)}
            className={`${chip} ${show === s.key ? chipOn : chipOff}`}
          >
            {s.label}
          </button>
        ))}
        {[null, ...areas].map((a) => (
          <button
            key={a ?? "all-india"}
            type="button"
            aria-pressed={area === a}
            onClick={() => setArea(a)}
            className={`${chip} ${area === a ? chipOn : chipOff}`}
          >
            {a ?? "All of India"}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="text-sm font-bold text-red-700 dark:text-red-400">
          {error}
        </p>
      )}

      {shown.length === 0 ? (
        <p className={muted}>
          {show === "done"
            ? "No ride marked done yet. Pick one and go."
            : show === "pending"
              ? "Nothing on your want-to-ride list yet."
              : "No ride here."}
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((r) => {
            const status = marks[r.slug]?.status;
            return (
              <li key={r.slug} className={`${card} flex min-w-0 flex-col gap-2 p-3`}>
                <Link href={`/rides/${r.slug}`} className="flex flex-col gap-2">
                  <RouteSketch
                    line={r.line}
                    className="bg-brand-tint h-24 w-full rounded-lg dark:bg-teal-950"
                  />
                  <span className="font-display text-base leading-tight font-bold hover:underline">
                    {status === "done" && <span aria-hidden>✓ </span>}
                    {r.title}
                  </span>
                </Link>
                {r.tier === "legend" && (
                  <span className="text-ghat-dark self-start text-xs font-bold tracking-wide uppercase dark:text-orange-300">
                    Legend · once in a lifetime
                  </span>
                )}
                <span className={`${muted} text-sm`}>{r.region}</span>
                {me && (
                  <div className="mt-auto flex flex-wrap gap-2">
                    <button
                      type="button"
                      aria-pressed={status === "pending"}
                      onClick={() => void toggle(r.slug, "pending")}
                      className={`${chip} ${status === "pending" ? chipOn : chipOff}`}
                    >
                      Want to ride
                    </button>
                    <button
                      type="button"
                      aria-pressed={status === "done"}
                      onClick={() => void toggle(r.slug, "done")}
                      className={`${chip} ${status === "done" ? chipOn : chipOff}`}
                    >
                      Done
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
