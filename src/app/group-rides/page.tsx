import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GroupRideBrowser } from "@/components/community/GroupRideBrowser";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteNav } from "@/components/site/SiteNav";
import { communityEnabled } from "@/lib/community/enabled";
import { SITE_NAME } from "@/lib/site";
import { listGroupRides } from "@/server/services/groupRideService";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `Group rides · ${SITE_NAME}`,
  description:
    "Rides other riders are hosting: the road, the day, the pace and the seats left. Ask to join, or host your own.",
  alternates: { canonical: "/group-rides" },
};

/** Upcoming public group rides, soonest first (docs/02, "Community (G6)"). */
export default async function GroupRidesPage() {
  if (!communityEnabled) notFound();
  const rides = await listGroupRides({}).catch(() => []);
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6">
      <SiteNav current="/group-rides" />
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-extrabold tracking-tight md:text-4xl">
          Group rides
        </h1>
        <p className="max-w-2xl text-stone-600 dark:text-stone-400">
          Rides riders are hosting. Each host decides who comes along; once you&apos;re in you get
          the meeting point, the group&apos;s WhatsApp and a live map for the day.
        </p>
      </header>
      <GroupRideBrowser initial={rides} />
      <SiteFooter />
    </main>
  );
}
