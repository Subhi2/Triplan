import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { z } from "zod";
import { GroupRideDetail } from "@/components/community/GroupRideDetail";
import { RiderProvider } from "@/components/community/RiderGate";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteNav } from "@/components/site/SiteNav";
import { communityEnabled } from "@/lib/community/enabled";
import { formatRideTime } from "@/lib/community/shareText";
import { SITE_NAME } from "@/lib/site";
import { openGroupRide, rideExists } from "@/server/services/groupRideService";

// Seats and riders change at any time; the viewer's own part loads in the browser.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

const load = cache(async (id: string) => {
  if (!communityEnabled || !z.uuid().safeParse(id).success) return null;
  const exists = await rideExists(id);
  return exists ? { exists, ride: await openGroupRide(id) } : null;
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await load((await params).id);
  if (!found) return { title: `Ride not found · ${SITE_NAME}` };
  const ride = found.ride;
  if (!ride) return { title: `Members-only ride · ${SITE_NAME}`, robots: { index: false } };
  const description = `${formatRideTime(ride.startsAt)} from ${ride.meetLabel}: ${ride.from} → ${ride.to}, hosted by ${ride.host}. ${ride.seatsLeft} seats left.`;
  return {
    title: `${ride.title} · ${SITE_NAME}`,
    description,
    // Rides are short-lived and anyone can put one up: kept out of search, links still unfurl.
    robots: { index: false, follow: true },
    openGraph: { siteName: SITE_NAME, type: "website", title: ride.title, description },
    twitter: { card: "summary_large_image", title: ride.title, description },
  };
}

/** A group ride's page: public and link-only rides render here; members-only ones in the browser. */
export default async function GroupRidePage({ params }: Props) {
  const id = (await params).id;
  const found = await load(id);
  if (!found) notFound();
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
      <SiteNav current="/group-rides" />
      <RiderProvider>
        <GroupRideDetail id={id} initial={found.ride} />
      </RiderProvider>
      <SiteFooter />
    </main>
  );
}
