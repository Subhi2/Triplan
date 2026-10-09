import { googleEnabled } from "@/lib/google";
import { GOOGLE_PHOTO_WIDTH } from "@/lib/googleGap";
import { getGooglePlacesProvider, isPhotoName } from "@/server/providers/google";
import { takeGoogleBudget } from "@/server/providers/google/budget";
import { allowRequestOrOpen, REQUEST_LIMITS } from "@/server/services/writeLimit";

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * GET ?name=places/.../photos/... -> redirect to Google's short-lived URL of the photo. Each call
 * is a billed request, so it takes from the day's photo budget; the bytes are never proxied or
 * stored (Maps ToS 3.2.3(b)).
 */
export async function GET(request: Request) {
  const name = new URL(request.url).searchParams.get("name") ?? "";
  if (name.length > 1000 || !isPhotoName(name)) {
    return Response.json({ error: "Not a Google photo" }, { status: 400, headers: NO_STORE });
  }
  const google = getGooglePlacesProvider();
  if (!googleEnabled || !google) {
    return Response.json({ error: "Google is not set up" }, { status: 404, headers: NO_STORE });
  }
  if (!(await allowRequestOrOpen(request, REQUEST_LIMITS.googlePhoto))) {
    return Response.json({ error: "No more photos for now" }, { status: 429, headers: NO_STORE });
  }
  try {
    if (!(await takeGoogleBudget("photo"))) {
      return Response.json({ error: "No more photos today" }, { status: 429, headers: NO_STORE });
    }
    const uri = await google.photoUri(name, GOOGLE_PHOTO_WIDTH);
    return new Response(null, { status: 302, headers: { Location: uri, ...NO_STORE } });
  } catch (err) {
    console.error("GET /api/google/photo failed", err);
    return Response.json({ error: "Google is not available" }, { status: 502, headers: NO_STORE });
  }
}
