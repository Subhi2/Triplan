import type { Metadata } from "next";
import Link from "next/link";
import { RouteSketch } from "@/components/ride/RouteSketch";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteNav } from "@/components/site/SiteNav";
import { formatDuration, formatKm, formatMetres } from "@/lib/format";
import { SITE_NAME } from "@/lib/site";
import { listRides } from "@/server/services/rideService";

// The list changes only when the rides are seeded again.
export const revalidate = 86400;

export const metadata: Metadata = {
  title: `Famous rides in India · ${SITE_NAME}`,
  description:
    "Well-known bike and road trips across India: ghats, hairpins, high passes and coasts, each with its route, climbs, best months and the places worth stopping for.",
  alternates: { canonical: "/rides" },
};

export default async function RidesPage() {
  const rides = await listRides().catch(() => []);
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6">
      <SiteNav current="/rides" />
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-extrabold tracking-tight md:text-4xl">
          Famous rides
        </h1>
        <p className="max-w-2xl text-stone-600 dark:text-stone-400">
          Roads riders talk about: ghats with numbered hairpins, high passes, coasts and deserts.
          Each comes with its route, its climbs, the best months to ride and the places worth
          stopping for, ready to open in the planner.
        </p>
      </header>
      {rides.length === 0 ? (
        <p className="text-stone-600 dark:text-stone-400">No rides yet.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Famous rides">
          {rides.map((r, i) => (
            <li
              key={r.slug}
              className="animate-rise"
              style={{ animationDelay: `${Math.min(i, 9) * 40}ms` }}
            >
              <Link
                href={`/rides/${r.slug}`}
                className="group flex h-full flex-col gap-3 rounded-2xl border border-stone-200 bg-(--surface) p-4 hover:border-stone-400 dark:border-stone-700"
              >
                <RouteSketch
                  line={r.line}
                  className="bg-brand-tint h-36 w-full rounded-xl dark:bg-teal-950"
                />
                <span className="flex flex-col gap-1">
                  <span className="font-display text-lg leading-tight font-bold group-hover:underline">
                    {r.title}
                  </span>
                  <span className="text-sm text-stone-600 dark:text-stone-400">{r.region}</span>
                </span>
                <span className="tabular mt-auto flex flex-wrap gap-x-3 gap-y-1 font-mono text-sm">
                  <span>{formatKm(r.distanceKm * 1000)}</span>
                  <span>{formatDuration(r.durationMin)}</span>
                  {r.hairpins > 0 && (
                    <span className="text-ghat-dark font-semibold dark:text-orange-300">
                      {r.hairpins} hairpins
                    </span>
                  )}
                  {r.ascentM !== null && <span>↑ {formatMetres(r.ascentM)}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <SiteFooter />
    </main>
  );
}
