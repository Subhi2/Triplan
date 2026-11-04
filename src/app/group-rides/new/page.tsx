import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HostRideForm } from "@/components/community/HostRideForm";
import { RiderProvider } from "@/components/community/RiderGate";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteNav } from "@/components/site/SiteNav";
import { communityEnabled } from "@/lib/community/enabled";
import { clubSlugSchema } from "@/lib/community/schemas";
import { tripIdSchema } from "@/lib/savedTrip";
import { SITE_NAME } from "@/lib/site";
import { clubBySlug } from "@/server/services/clubService";
import { getTrip } from "@/server/services/tripService";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `Host a group ride · ${SITE_NAME}`,
  robots: { index: false, follow: false },
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** /group-rides/new?trip=<id>&club=<slug>: host a ride on a saved trip, maybe for a club. */
export default async function NewGroupRidePage({ searchParams }: Props) {
  if (!communityEnabled) notFound();
  const q = await searchParams;
  const tripId = tripIdSchema.safeParse(one(q.trip));
  const clubSlug = clubSlugSchema.safeParse(one(q.club));
  const [trip, club] = await Promise.all([
    tripId.success ? getTrip(tripId.data) : null,
    clubSlug.success ? clubBySlug(clubSlug.data) : null,
  ]);
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6">
      <SiteNav current="/group-rides" />
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Host a group ride</h1>
        <p className="text-stone-600 dark:text-stone-400">
          Riders ask to join and you decide, or let them in while seats last. It goes up at once.
        </p>
      </header>
      <RiderProvider>
        <HostRideForm trip={trip} club={club} />
      </RiderProvider>
      <SiteFooter />
    </main>
  );
}
