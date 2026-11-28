import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EmbedCard } from "@/components/embed/EmbedCard";
import { formatDuration, formatKm } from "@/lib/format";
import type { LngLat } from "@/lib/geo";
import { placeRank } from "@/lib/places";
import { spreadStops } from "@/lib/roadBook";
import { ridePlannerUrl } from "@/lib/rides";
import { siteUrl } from "@/lib/site";
import { placesAlong, toPlaceAlong } from "@/server/services/corridorService";
import { getRide } from "@/server/services/rideService";

// A famous ride as a card other sites can frame (G12, C8). Rendered on first visit, then kept a day.
export const revalidate = 86400;

export const metadata: Metadata = { robots: { index: false, follow: false } };

const STOPS = 5;

export default async function EmbedRidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const found = /^[a-z0-9-]{3,100}$/.test(slug) ? await getRide(slug).catch(() => null) : null;
  if (!found) notFound();
  const { ride, geometry } = found;
  const places = await placesAlong(geometry, 2_000, null).catch(() => []);
  const stops = spreadStops(places, ride.distanceKm, (p) => placeRank(toPlaceAlong(p)), STOPS);
  const facts = [
    formatKm(ride.distanceKm * 1000),
    formatDuration(ride.durationMin),
    ride.hairpins > 0 ? `${ride.hairpins} hairpins` : null,
  ].filter((f): f is string => Boolean(f));
  return (
    <EmbedCard
      title={ride.title}
      facts={facts}
      line={geometry.coordinates as LngLat[]}
      stops={stops.map((p) => ({ name: p.name, kmFromStart: p.kmFromStart }))}
      href={`${siteUrl()}${ridePlannerUrl(ride)}`}
    />
  );
}
