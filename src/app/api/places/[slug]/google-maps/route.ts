import { googleMapsPlaceUrl } from "@/lib/googleMaps";
import { PLACE_SLUG_PATTERN } from "@/lib/placeDetail";
import { getGooglePlaceId } from "@/server/services/googleGapService";

/**
 * GET -> redirect to the place on Google Maps: the exact place once its Google place id is known
 * (looked up here the first time, then stored), else a search for its name at its spot.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (slug.length > 200 || !PLACE_SLUG_PATTERN.test(slug)) {
    return Response.json({ error: "Place not found" }, { status: 404 });
  }
  let place: Awaited<ReturnType<typeof getGooglePlaceId>>;
  try {
    place = await getGooglePlaceId(slug);
  } catch (err) {
    console.error(`GET /api/places/${slug}/google-maps failed`, err);
    return Response.json({ error: "Could not load the place" }, { status: 500 });
  }
  if (!place) return Response.json({ error: "Place not found" }, { status: 404 });
  return new Response(null, {
    status: 302,
    headers: { Location: googleMapsPlaceUrl(place), "Cache-Control": "private, no-store" },
  });
}
