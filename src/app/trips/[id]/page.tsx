import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache, Suspense } from "react";
import { Planner } from "@/components/trip/Planner";
import { formatDuration, formatKm } from "@/lib/format";
import { tripIdSchema } from "@/lib/savedTrip";
import { SITE_NAME, tripHeadline } from "@/lib/site";
import { getTrip } from "@/server/services/tripService";

// Anyone may update a trip, so always show the latest version.
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

const loadTrip = cache(async (id: string) =>
  tripIdSchema.safeParse(id).success ? getTrip(id) : null,
);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const trip = await loadTrip((await params).id);
  if (!trip) return { title: `Trip not found · ${SITE_NAME}` };
  const headline = tripHeadline(trip.stops.map((s) => s.label));
  const facts = [
    trip.distanceKm !== null && formatKm(trip.distanceKm * 1000),
    trip.durationMin !== null && formatDuration(trip.durationMin),
    !headline.includes(" via ") && trip.viaLabel,
  ].filter(Boolean);
  const description = `${headline}${facts.length ? ` · ${facts.join(" · ")}` : ""}. Every place worth stopping for along the route.`;
  return {
    title: `${trip.title} · ${SITE_NAME}`,
    description,
    // Anyone can save a trip, so trips stay out of search results; their links still unfurl.
    robots: { index: false, follow: true },
    // The share image comes from opengraph-image.tsx next to this page.
    openGraph: { siteName: SITE_NAME, type: "website", title: trip.title, description },
    twitter: { card: "summary_large_image", title: trip.title, description },
  };
}

/** A saved trip's own link: the planner, opened with the trip. */
export default async function TripPage({ params }: Props) {
  const trip = await loadTrip((await params).id);
  if (!trip) notFound();
  return (
    // useSearchParams in Planner needs a Suspense boundary.
    <Suspense>
      <Planner savedTrip={trip} />
    </Suspense>
  );
}
