import { googleEnabled } from "@/lib/google";
import { PLACE_SLUG_PATTERN } from "@/lib/placeDetail";
import { getGoogleGapFill } from "@/server/services/googleGapService";

// Google content is fetched live and must not be cached or stored (Maps ToS 3.2.3(b)).
const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * GET -> GoogleGapResult: Google's photos, rating and reviews for what the place lacks.
 * Only with the Google map on (the Google key set): Google content may not sit next to MapLibre.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (slug.length > 200 || !PLACE_SLUG_PATTERN.test(slug)) {
    return Response.json({ error: "Place not found" }, { status: 404, headers: NO_STORE });
  }
  if (!googleEnabled) {
    return Response.json({ googlePlaceId: null, fill: null }, { headers: NO_STORE });
  }
  try {
    const result = await getGoogleGapFill(slug);
    if (!result)
      return Response.json({ error: "Place not found" }, { status: 404, headers: NO_STORE });
    return Response.json(result, { headers: NO_STORE });
  } catch (err) {
    console.error(`GET /api/places/${slug}/google failed`, err);
    return Response.json({ error: "Google is not available" }, { status: 502, headers: NO_STORE });
  }
}
