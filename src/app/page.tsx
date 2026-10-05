import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import { Suspense } from "react";
import { Planner } from "@/components/trip/Planner";
import { SITE_NAME, tripHeadline } from "@/lib/site";
import { parseTripUrl } from "@/lib/tripUrl";
import { listRides } from "@/server/services/rideService";

/** Famous rides for "Try a famous ride", read at most hourly; none if the database is down. */
const famousRides = unstable_cache(() => listRides().catch(() => []), ["famous-rides"], {
  revalidate: 3600,
});

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** A shared planner link (?from=…&to=…) gets its own title and share card. */
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
      query.append(key, v);
    }
  }
  const trip = parseTripUrl(query);
  const stops = [trip.from, ...trip.via, trip.to].filter((s) => s !== null);
  if (stops.length < 2) return { alternates: { canonical: "/" } };

  const headline = tripHeadline(stops.map((s) => s.label));
  const card = new URLSearchParams({ v: trip.vehicle });
  if (trip.from) card.set("from", query.get("from")!);
  for (const via of query.getAll("via")) card.append("via", via);
  if (trip.to) card.set("to", query.get("to")!);
  const description = `Temples, forts, viewpoints, waterfalls and food stops along the road, in km order. Planned on ${SITE_NAME}.`;
  const images = [{ url: `/og/plan?${card.toString()}`, width: 1200, height: 630, alt: headline }];
  return {
    title: `${headline} · ${SITE_NAME}`,
    description,
    alternates: { canonical: "/" },
    openGraph: { siteName: SITE_NAME, type: "website", title: headline, description, images },
    twitter: { card: "summary_large_image", title: headline, description, images },
  };
}

export default async function HomePage() {
  const rides = await famousRides();
  // useSearchParams in Planner needs a Suspense boundary.
  return (
    <Suspense>
      <Planner famousRides={rides} />
    </Suspense>
  );
}
