// What Google fills in for a place with gaps (docs/02, "Google Maps Platform"). Fetched live from
// GET /api/places/[slug]/google and never stored or cached (Maps ToS 3.2.3(b)).

export interface GoogleAuthor {
  displayName: string;
  uri: string | null;
  photoUri: string | null;
}

export interface GooglePhoto {
  /** Google's photo resource name; the image is served by /api/google/photo?name=. */
  name: string;
  widthPx: number;
  heightPx: number;
  authors: GoogleAuthor[];
}

export interface GoogleReview {
  author: GoogleAuthor;
  rating: number;
  text: string | null;
  /** "2 months ago", as Google words it. */
  relativeTime: string;
}

export interface GoogleGapFill {
  googleMapsUri: string | null;
  rating: number | null;
  ratingCount: number | null;
  reviews: GoogleReview[];
  photos: GooglePhoto[];
}

/** Photos shown per place (each one is a billed request when it loads). */
export const GOOGLE_PHOTOS_MAX = 5;

/** Width asked of Google for a photo; the sheet and place page show it at most this wide. */
export const GOOGLE_PHOTO_WIDTH = 800;

/** The URL of our redirect to a Google photo. */
export function googlePhotoUrl(name: string): string {
  return `/api/google/photo?name=${encodeURIComponent(name)}`;
}
