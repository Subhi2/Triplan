// Google Maps Platform fills gaps only (docs/02, "Google Maps Platform"). Its content (photos,
// ratings, reviews) may only be shown with a Google map, so everything Google hangs off the
// key: without it the app uses MapLibre and shows nothing from Google.

/** The Google key (also used by the server, see providers/google), inlined at build time. */
export const GOOGLE_MAPS_BROWSER_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ?? "";

/** Map ID for Advanced Markers; Google's demo id works for development without cloud styling. */
export const GOOGLE_MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAP_ID?.trim() || "DEMO_MAP_ID";

/** True when the Google map is used and Google content may be shown. */
export const googleEnabled = GOOGLE_MAPS_BROWSER_KEY !== "";
