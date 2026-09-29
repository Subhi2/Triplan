import { PLACE_SLUG_PATTERN } from "@/lib/placeDetail";
import { getPlaceDetail } from "@/server/services/placeDetailService";

/** GET -> { place: PlaceDetail }, or 404 for an unknown place. */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (slug.length > 200 || !PLACE_SLUG_PATTERN.test(slug)) {
    return Response.json({ error: "Place not found" }, { status: 404 });
  }
  try {
    const place = await getPlaceDetail(slug);
    if (!place) return Response.json({ error: "Place not found" }, { status: 404 });
    return Response.json({ place });
  } catch (err) {
    console.error(`GET /api/places/${slug} failed`, err);
    return Response.json({ error: "Could not load the place" }, { status: 500 });
  }
}
