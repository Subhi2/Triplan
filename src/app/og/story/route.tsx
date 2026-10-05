import { ImageResponse } from "next/og";
import { ROUTE_ID_PATTERN } from "@/lib/places";
import { tripIdSchema } from "@/lib/savedTrip";
import { siteUrl } from "@/lib/site";
import { parseTripUrl } from "@/lib/tripUrl";
import { StoryCard, storyOptions } from "@/server/og/shareCards";
import {
  storyForRide,
  storyForRoute,
  storyForTrip,
  type StoryData,
} from "@/server/services/storyService";

// A cold profile reads up to ~160 terrain tiles.
export const maxDuration = 30;

/**
 * GET /og/story: a 1080×1920 ride story poster (PNG).
 *   ?route=<route id>&from=…&via=…&to=…&v=bike  a planner route (its id is a content hash)
 *   ?trip=<saved trip id>
 *   ?ride=<famous ride slug>
 * A route that has left the cache gives a poster with the app's name and no numbers, cached
 * briefly.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const routeId = params.get("route");
  const tripId = params.get("trip");
  const rideSlug = params.get("ride");
  let data: StoryData | null = null;
  try {
    if (routeId && ROUTE_ID_PATTERN.test(routeId)) {
      const trip = parseTripUrl(params);
      const stops = [trip.from, ...trip.via, trip.to].filter((s) => s !== null);
      data = await storyForRoute(routeId, stops, trip.vehicle);
    } else if (tripId && tripIdSchema.safeParse(tripId).success) {
      data = await storyForTrip(tripId);
    } else if (rideSlug && /^[a-z0-9-]{3,100}$/.test(rideSlug)) {
      data = await storyForRide(rideSlug);
    }
  } catch (err) {
    console.error("GET /og/story failed", err);
  }
  const site = siteUrl().replace(/^https?:\/\//, "");
  return new ImageResponse(
    <StoryCard data={data} site={site} />,
    await storyOptions({
      "Cache-Control": data
        ? "public, max-age=86400, s-maxage=604800"
        : "public, max-age=60, s-maxage=60",
    }),
  );
}
