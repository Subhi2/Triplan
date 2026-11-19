import { ImageResponse } from "next/og";
import { doneCardDate } from "@/lib/doneCard";
import { formatDuration, formatKm, formatMetres } from "@/lib/format";
import type { LngLat } from "@/lib/geo";
import { SITE_NAME } from "@/lib/site";
import { thinLine } from "@/lib/story";
import { cardOptions, TripCard } from "@/server/og/shareCards";
import { getRide } from "@/server/services/rideService";

/**
 * GET /og/done?ride=<famous ride slug>&on=<YYYY-MM-DD>: "I rode this" share card (1200×630 PNG).
 * Our own route line and numbers only: no photo, no nickname, no note. The date is optional and
 * only shown when it is a real day that is not in the future.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const slug = params.get("ride") ?? "";
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
  const title = [
    ride.tier === "legend" ? "Ridden · Legend" : "Ridden",
    doneCardDate(params.get("on")),
  ]
    .filter(Boolean)
    .join(" · ");
  return new ImageResponse(
    <TripCard
      title={title}
      headline={ride.title}
      facts={facts}
      line={thinLine(geometry.coordinates as LngLat[], 800)}
      stops={ride.stops.map((s) => s.location)}
    />,
    await cardOptions(),
  );
}
