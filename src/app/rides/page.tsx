import type { Metadata } from "next";
import Link from "next/link";
import { CountUp } from "@/components/motion/CountUp";
import { CrownList } from "@/components/motion/CrownList";
import { RouteSketch } from "@/components/ride/RouteSketch";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteNav } from "@/components/site/SiteNav";
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
        <CrownList
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          aria-label="Famous rides"
          selector="[data-ride-card]"
          config={{
            axis: "xy",
            radius: 300,
            lift: 10,
            shift: 10,
            grow: 0.03,
            glow: 0.6,
            toward: true,
          }}
        >
          {rides.map((r, i) => (
            <li
              key={r.slug}
              className="animate-rise"
              style={{ animationDelay: `${Math.min(i, 9) * 40}ms` }}
            >
              <Link
                href={`/rides/${r.slug}`}
                data-ride-card
                className="crown crown-glow group flex h-full flex-col gap-3 rounded-2xl border border-stone-200 bg-(--surface) p-4 hover:border-stone-400 dark:border-stone-700"
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
                  <CountUp value={r.distanceKm} unit="km" fromServer />
                  <CountUp value={r.durationMin} unit="duration" fromServer />
                  {r.hairpins > 0 && (
                    <span className="text-ghat-dark font-semibold dark:text-orange-300">
                      <CountUp value={r.hairpins} fromServer /> hairpins
                    </span>
                  )}
                  {r.ascentM !== null && (
                    <span>
                      ↑ <CountUp value={r.ascentM} unit="metres" fromServer />
                    </span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </CrownList>
      )}
      <SiteFooter />
    </main>
  );
}
