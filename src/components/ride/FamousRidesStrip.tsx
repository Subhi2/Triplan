import Link from "next/link";
import { formatKm } from "@/lib/format";
import { ridePlannerUrl, type RideSummary } from "@/lib/rides";
import { RouteSketch } from "./RouteSketch";

/**
 * "Try a famous ride" on the empty planner: rides that open in the planner with one tap, so a
 * first-time visitor sees what the app does.
 */
export function FamousRidesStrip({ rides }: { rides: RideSummary[] }) {
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
      <ul className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
        {rides.slice(0, 8).map((r) => (
          <li key={r.slug} className="w-40 shrink-0 snap-start">
            {/* A full page load: the planner reads its trip from the address once. */}
            <a
              href={ridePlannerUrl(r)}
              data-ride={r.slug}
              className="flex h-full flex-col gap-1.5 rounded-xl border border-stone-200 bg-(--surface) p-2 hover:border-stone-400 dark:border-stone-700"
            >
              <RouteSketch
                line={r.line}
                className="bg-brand-tint h-16 w-full rounded-lg dark:bg-teal-950"
              />
              <span className="line-clamp-2 text-sm leading-tight font-bold">{r.title}</span>
              <span className="tabular mt-auto font-mono text-xs text-stone-600 dark:text-stone-400">
                {formatKm(r.distanceKm * 1000)}
                {r.hairpins > 0 && ` · ${r.hairpins} hairpins`}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
