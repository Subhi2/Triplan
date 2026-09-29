import type { GoogleGapFill } from "@/lib/googleGap";

/** Place Details fields we ask for, grouped by the gap they fill (docs/02, "Google Maps Platform"). */
export type GoogleGap = "photos" | "reviews";

export interface GooglePlacesProvider {
  /**
   * The Google place id of the place called `name` near `location` ([lng, lat]), or null when
   * Google has none within about 300 m. Text Search Essentials (IDs only): free.
   */
  findPlaceId(name: string, location: [number, number]): Promise<string | null>;
  /**
   * The fields of the given gaps, fetched live and never stored. Null when Google no longer
   * knows the id. Photos only: Place Details Essentials (IDs only), free; with reviews:
   * Enterprise + Atmosphere.
   */
  details(placeId: string, gaps: GoogleGap[]): Promise<GoogleGapFill | null>;
  /** A short-lived URL of a photo (`photos[].name` from details), at most `maxWidthPx` wide. */
  photoUri(photoName: string, maxWidthPx: number): Promise<string>;
}
