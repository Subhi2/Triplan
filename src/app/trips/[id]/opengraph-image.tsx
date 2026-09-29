import { ImageResponse } from "next/og";
import { formatDuration, formatKm } from "@/lib/format";
import { tripIdSchema } from "@/lib/savedTrip";
import { SITE_NAME, tripHeadline } from "@/lib/site";
import { CARD_SIZE, cardOptions, TripCard } from "@/server/og/shareCards";
import { getTrip, getTripLine } from "@/server/services/tripService";

export const alt = `A trip planned on ${SITE_NAME}`;
export const size = CARD_SIZE;
export const contentType = "image/png";

/** The card a saved trip's link shows in WhatsApp and other apps: route sketch, stops, distance. */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const trip = tripIdSchema.safeParse(id).success ? await getTrip(id) : null;
  if (!trip) {
    return new ImageResponse(
      <TripCard headline={SITE_NAME} facts={[]} line={[]} stops={[]} />,
      size,
    );
  }
  const line = await getTripLine(id);
  const headline = tripHeadline(trip.stops.map((s) => s.label));
  const facts = [
    trip.distanceKm !== null && formatKm(trip.distanceKm * 1000),
    trip.durationMin !== null && formatDuration(trip.durationMin),
    trip.vehicle === "bike" ? "Bike" : "Car",
    !headline.includes(" via ") && trip.viaLabel,
  ].filter((f): f is string => Boolean(f));
  return new ImageResponse(
    <TripCard
      title={trip.title !== headline ? trip.title : null}
      headline={headline}
      facts={facts}
      line={line}
      stops={trip.stops.map((s) => s.location)}
    />,
    await cardOptions(),
  );
}
