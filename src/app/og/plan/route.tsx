import { ImageResponse } from "next/og";
import { parseTripUrl } from "@/lib/tripUrl";
import { SITE_NAME, tripHeadline } from "@/lib/site";
import { cardOptions, TripCard } from "@/server/og/shareCards";

/**
 * GET /og/plan?from=…&via=…&to=…&v=bike: the share card of a planner link that was not saved.
 * Only the stops are known here (no route), so they are joined with dashed lines.
 */
export async function GET(request: Request) {
  const trip = parseTripUrl(new URL(request.url).searchParams);
  const stops = [trip.from, ...trip.via, trip.to].filter((s) => s !== null);
  const headline = stops.length >= 2 ? tripHeadline(stops.map((s) => s.label)) : SITE_NAME;
  const facts =
    stops.length >= 2
      ? [
          trip.vehicle === "bike" ? "Bike trip" : "Car trip",
          "Places along the route",
          "Best time to visit",
        ]
      : ["Plan a bike or car trip", "Places along your route"];
  return new ImageResponse(
    <TripCard
      headline={headline}
      facts={facts}
      line={[]}
      stops={stops.map((s) => s.location)}
      dashed
    />,
    await cardOptions({ "Cache-Control": "public, max-age=86400, s-maxage=604800, immutable" }),
  );
}
