"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { NicknamePrompt, RiderProvider } from "@/components/community/RiderGate";
import { DynamicMapLibreView } from "@/components/map/DynamicMapView";
import { INDIA_BOUNDS, type MapFrame, type MapRidePreview } from "@/components/map/types";
import { useRideMarks } from "@/components/community/useRideMarks";
import { card, chip, chipOff, chipOn, muted, secondaryButton } from "@/components/community/ui";
import { badgesFor } from "@/lib/badges";
import { rideArea, RIDE_AREAS, type RideArea, type RidePhoto, type RideSummary } from "@/lib/rides";
import { CountUp } from "@/components/motion/CountUp";
import { rideInList, type RideListKey } from "@/lib/rideLists";
import { RideListChips } from "./RideListChips";
import { RideCarousel } from "./RideCarousel";

/** The map opens on India (the same box the planner starts with). */
const INDIA_FRAME: MapFrame = { key: "india", points: [...INDIA_BOUNDS] };

type Show = "all" | "pending" | "done" | "legend";
const SHOWS: { key: Show; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Want to ride" },
  { key: "done", label: "Done" },
  { key: "legend", label: "Legends" },
];

/** Every famous ride with the rider's own Done / Want-to-ride marks and how far they have got. */
export function BucketList({
  rides,
  photos = {},
}: {
  rides: RideSummary[];
  /** The same credited photo per ride as the famous rides page. */
  photos?: Record<string, RidePhoto[]>;
}) {
  return (
    <RiderProvider>
      <BucketListBody rides={rides} photos={photos} />
    </RiderProvider>
  );
}

function BucketListBody({
  rides,
  photos,
}: {
  rides: RideSummary[];
  photos: Record<string, RidePhoto[]>;
}) {
  const { me, marks, loading, save, remove } = useRideMarks();
  const router = useRouter();
  const [show, setShow] = useState<Show>("all");
  const [area, setArea] = useState<RideArea | null>(null);
  const [list, setList] = useState<RideListKey | null>(null);
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
      (area === null || rideArea(r.region) === area) &&
      (list === null || rideInList(r, list)),
  );

  // The map draws the rides that match the filters: done in teal, wanted in amber, the rest faded.
  // Rebuilt only when the set or a mark changes, so the map does not redraw on every keystroke.
  const previewKey = shown.map((r) => `${r.slug}:${marks[r.slug]?.status ?? "none"}`).join(",");
  const previews = useMemo<MapRidePreview[]>(
    () =>
      previewKey
        ? previewKey.split(",").map((entry) => {
            const [slug, state] = entry.split(":") as [string, "done" | "pending" | "none"];
            return { slug, line: rides.find((r) => r.slug === slug)?.line ?? [], state };
          })
        : [],
    [previewKey, rides],
  );
  const wanted = rides.filter((r) => marks[r.slug]?.status === "pending").length;

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

      <section aria-label="Map of India with your rides" className="flex flex-col gap-2">
        <div className="h-72 w-full overflow-hidden rounded-2xl border border-stone-200 md:h-[26rem] dark:border-stone-700">
          <DynamicMapLibreView
            routes={[]}
            selectedRouteId={null}
            onSelectRoute={() => {}}
            stops={[]}
            places={[]}
            activePlaceId={null}
            hoverPlaceId={null}
            onSelectPlace={() => {}}
            onHoverPlace={() => {}}
            frame={INDIA_FRAME}
            ridePreviews={previews}
            onSelectRidePreview={(slug) => router.push(`/rides/${slug}`)}
          />
        </div>
        <p className="text-sm text-stone-600 dark:text-stone-400">
          <span className="font-bold text-teal-700 dark:text-teal-300">Teal</span> done (
          <span className="tabular font-mono">{done}</span>),{" "}
          <span className="font-bold text-amber-700 dark:text-amber-400">amber</span> want to ride (
          <span className="tabular font-mono">{wanted}</span>), grey not yet. Tap a road to open the
          ride.
        </p>
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

      <RideListChips rides={rides} value={list} onChange={setList} />

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
                <RideCarousel photos={photos[r.slug] ?? []} line={r.line} size="card" linkCredit />
                <Link href={`/rides/${r.slug}`} className="flex flex-col gap-2">
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
                <span className="tabular flex flex-wrap gap-x-3 gap-y-1 font-mono text-sm">
                  <CountUp value={r.distanceKm} unit="km" fromServer />
                  <CountUp value={r.durationMin} unit="duration" fromServer />
                  {r.hairpins > 0 && (
                    <span className="text-ghat-dark font-semibold dark:text-orange-300">
                      <CountUp value={r.hairpins} fromServer /> hairpins
                    </span>
                  )}
                </span>
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
