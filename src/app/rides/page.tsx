import type { Metadata } from "next";
import { RideBrowser } from "@/components/ride/RideBrowser";
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
        <RideBrowser rides={rides} />
      )}
      <SiteFooter />
    </main>
  );
}
