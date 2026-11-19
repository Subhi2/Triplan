import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BucketList } from "@/components/ride/BucketList";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteNav } from "@/components/site/SiteNav";
import { communityEnabled } from "@/lib/community/enabled";
import { SITE_NAME } from "@/lib/site";
import { listRides } from "@/server/services/rideService";

// The ride list changes only when rides are seeded; each rider's marks load in the browser.
export const revalidate = 86400;

export const metadata: Metadata = {
  title: `Ride bucket list · ${SITE_NAME}`,
  description: "Tick off India's famous rides, once in a lifetime each.",
  robots: { index: false, follow: false },
};

export default async function BucketListPage() {
  if (!communityEnabled) notFound();
  const rides = await listRides().catch(() => []);
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6">
      <SiteNav current="/bucket-list" />
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-4xl leading-none font-extrabold tracking-tight md:text-6xl">
          Ride bucket list
        </h1>
        <p className="max-w-2xl text-stone-600 dark:text-stone-400">
          India&apos;s famous rides, each worth doing once in a lifetime. Mark the ones you want to
          ride and the ones you have ridden. Only you can see your list.
        </p>
      </header>
      {rides.length === 0 ? (
        <p className="text-stone-600 dark:text-stone-400">No rides yet.</p>
      ) : (
        <BucketList rides={rides} />
      )}
      <SiteFooter />
    </main>
  );
}
