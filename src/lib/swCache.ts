// What the service worker must never put in Cache Storage. Its default rules cache every
// same-origin /api/ answer and every cross-origin response. That would store Google reviews,
// photos and map tiles (Maps ToS 3.2.3(b): no caching) and the rider's position (/api/places/near).

const GOOGLE_HOST =
  /(^|\.)(google\.com|googleapis\.com|gstatic\.com|googleusercontent\.com|ggpht\.com)$/i;

/** True for requests the service worker sends to the network only, with no cached copy. */
export function isNeverCached(url: URL, sameOrigin: boolean): boolean {
  if (sameOrigin) return url.pathname.startsWith("/api/");
  return GOOGLE_HOST.test(url.hostname);
}
