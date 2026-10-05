import { ImageResponse } from "next/og";
import { formatDuration, formatKm, formatMetres } from "@/lib/format";
import type { LngLat } from "@/lib/geo";
import { SITE_NAME } from "@/lib/site";
import { thinLine } from "@/lib/story";
import { CARD_SIZE, cardOptions, TripCard } from "@/server/og/shareCards";
import { getRide } from "@/server/services/rideService";

export const alt = `A famous ride on ${SITE_NAME}`;
export const size = CARD_SIZE;
export const contentType = "image/png";

/** A ride page's share card: the route's shape, distance, time, hairpins and climb. */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const found = /^[a-z0-9-]{3,100}$/.test(slug) ? await getRide(slug).catch(() => null) : null;
  if (!found) {
    return new ImageResponse(
      <TripCard headline={SITE_NAME} facts={[]} line={[]} stops={[]} />,
      await cardOptions(),
    );
  }
  const { ride, geometry } = found;
  const facts = [
    formatKm(ride.distanceKm * 1000),
    formatDuration(ride.durationMin),
    ride.hairpins > 0 && `${ride.hairpins} hairpins`,
    ride.ascentM !== null && `↑ ${formatMetres(ride.ascentM)}`,
  ].filter((f): f is string => Boolean(f));
  return new ImageResponse(
    <TripCard
      title="Famous ride"
      headline={ride.title}
      facts={facts}
      line={thinLine(geometry.coordinates as LngLat[], 800)}
      stops={ride.stops.map((s) => s.location)}
    />,
    await cardOptions(),
  );
}
