import Link from "next/link";
import { CountUp } from "@/components/motion/CountUp";
import { CrownList } from "@/components/motion/CrownList";
import { mediaSourceName } from "@/lib/media";
import { ridePlannerUrl, type RidePhoto, type RideSummary } from "@/lib/rides";
import { RouteSketch } from "./RouteSketch";

/**
 * "Try a famous ride" on the empty planner: rides that open in the planner with one tap, so a
 * first-time visitor sees what the app does.
 */
export function FamousRidesStrip({
  rides,
  photos = {},
}: {
  rides: RideSummary[];
  /** A credited photo per ride slug, where one of our own exists near its road. */
  photos?: Record<string, RidePhoto>;
}) {
  if (rides.length === 0) return null;
  return (
    <section aria-labelledby="try-a-ride" className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="try-a-ride" className="font-display text-[17px] font-bold tracking-tight">
          Try a famous ride
        </h2>
        <Link
          href="/rides"
          className="text-brand-dark inline-flex min-h-11 items-center text-sm font-bold hover:underline md:min-h-0 dark:text-teal-300"
        >
          All rides
        </Link>
      </div>
      <CrownList
        className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pt-2 pb-1"
        selector="[data-ride]"
        config={{ axis: "x", radius: 170, lift: 6, shift: 8, grow: 0.04, glow: 0.6 }}
      >
        {rides.slice(0, 8).map((r) => (
          <li key={r.slug} className="w-40 shrink-0 snap-start">
            {/* A full page load: the planner reads its trip from the address once. */}
            <a
              href={ridePlannerUrl(r)}
              data-ride={r.slug}
              className="crown crown-glow flex h-full flex-col gap-1.5 rounded-xl border border-stone-200 bg-(--surface) p-2 hover:border-stone-400 dark:border-stone-700"
            >
              {photos[r.slug] ? (
                <span className="relative block">
                  {/* Our own credited photo (credit below), never Google's. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photos[r.slug]!.thumbUrl}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-24 w-full rounded-lg bg-stone-200 object-cover dark:bg-stone-800"
                  />
                  {/* The ride's path over the photo's corner. */}
                  <RouteSketch
                    line={r.line}
                    className="bg-brand-tint/95 absolute right-1.5 bottom-1.5 h-11 w-14 rounded-md dark:bg-teal-950/95"
                  />
                </span>
              ) : (
                <RouteSketch
                  line={r.line}
                  className="bg-brand-tint h-24 w-full rounded-lg dark:bg-teal-950"
                />
              )}
              <span className="line-clamp-2 text-sm leading-tight font-bold">{r.title}</span>
              {photos[r.slug] && (
                <span className="line-clamp-1 text-[11px] text-stone-600 dark:text-stone-400">
                  Photo {photos[r.slug]!.author ?? "unknown"} · {photos[r.slug]!.license} ·{" "}
                  {mediaSourceName(photos[r.slug]!.source)}
                </span>
              )}
              <span className="tabular mt-auto font-mono text-xs text-stone-600 dark:text-stone-400">
                <CountUp value={r.distanceKm} unit="km" fromServer />
                {r.hairpins > 0 && (
                  <>
                    {" · "}
                    <CountUp value={r.hairpins} fromServer /> hairpins
                  </>
                )}
              </span>
            </a>
          </li>
        ))}
      </CrownList>
    </section>
  );
}
