import type { Metadata } from "next";
import Link from "next/link";
import { RideBrowser } from "@/components/ride/RideBrowser";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteNav } from "@/components/site/SiteNav";
import { SITE_NAME } from "@/lib/site";
import { listRides, rideGalleries } from "@/server/services/rideService";

// The list changes only when the rides are seeded again.
export const revalidate = 86400;

export const metadata: Metadata = {
  title: `Famous rides in India · ${SITE_NAME}`,
  description:
    "Well-known bike and road trips across India: ghats, hairpins, high passes and coasts, each with its route, climbs, best months and the places worth stopping for.",
  alternates: { canonical: "/rides" },
};

export default async function RidesPage() {
  // Timings in the build log: a production build once stalled on this page (2026-11-28).
  const started = Date.now();
  const [rides, photos] = await Promise.all([
    listRides()
      .catch(() => [])
      .finally(() => console.log(`/rides: rides loaded in ${Date.now() - started} ms`)),
    // Photos are a nicety: without them the cards keep their route sketches.
    rideGalleries()
      .catch(() => ({}))
      .finally(() => console.log(`/rides: photos loaded in ${Date.now() - started} ms`)),
  ]);
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6">
      <SiteNav current="/rides" />
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-4xl leading-none font-extrabold tracking-tight md:text-6xl">
          Famous rides
        </h1>
        <p className="max-w-2xl text-stone-600 dark:text-stone-400">
          Roads riders talk about: ghats with numbered hairpins, high passes, coasts and deserts.
          Each comes with its route, its climbs, the best months to ride and the places worth
          stopping for, ready to open in the planner.
        </p>
        <p className="text-sm text-stone-600 dark:text-stone-400">
          Rode one of your own?{" "}
          <Link href="/" className="text-brand-dark font-bold hover:underline dark:text-teal-300">
            Open its GPX in the planner
          </Link>{" "}
          to see its hairpins, climbs and the places you passed.
        </p>
      </header>
      {rides.length === 0 ? (
        <p className="text-stone-600 dark:text-stone-400">No rides yet.</p>
      ) : (
        <RideBrowser rides={rides} photos={photos} />
      )}
      <SiteFooter />
    </main>
  );
}
