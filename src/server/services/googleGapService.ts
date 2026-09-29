import { sql } from "drizzle-orm";
import type { LngLat } from "@/lib/geo";
import { GOOGLE_PHOTOS_MAX, type GoogleGapFill } from "@/lib/googleGap";
import { getDb } from "../db";
import { getGooglePlacesProvider, type GoogleGap } from "../providers/google";
import { takeGoogleBudget } from "../providers/google/budget";

// Google fills gaps only (docs/02, "Google Maps Platform"): photos for places with none of our
// own, rating and reviews for places with fewer than MIN_OWN_REVIEWS. Only the place id is
// stored; everything else is fetched live and handed straight to the browser.

/** With this many verified reviews of our own, Google's are not fetched. */
export const MIN_OWN_REVIEWS = 3;
/** A lookup that found no Google place is not repeated for this long. */
const RETRY_NOT_FOUND = "30 days";

interface GapRow extends Record<string, unknown> {
  id: string;
  name: string;
  lng: number;
  lat: number;
  google_place_id: string | null;
  recently_checked: boolean;
  own_photos: number;
  own_reviews: number;
}

interface PlaceForGoogle {
  id: string;
  name: string;
  location: LngLat;
  googlePlaceId: string | null;
  recentlyChecked: boolean;
  gaps: GoogleGap[];
}

/** What a place lacks that Google could fill. */
export function placeGaps(ownPhotos: number, ownReviews: number): GoogleGap[] {
  const gaps: GoogleGap[] = [];
  if (ownPhotos === 0) gaps.push("photos");
  if (ownReviews < MIN_OWN_REVIEWS) gaps.push("reviews");
  return gaps;
}

async function loadPlace(slug: string): Promise<PlaceForGoogle | null> {
  const [row] = await getDb().execute<GapRow>(sql`
    SELECT p.id, p.name, ST_X(p.location::geometry) AS lng, ST_Y(p.location::geometry) AS lat,
           p.google_place_id,
           coalesce(p.google_place_checked_at > now() - ${RETRY_NOT_FOUND}::interval, false)
             AS recently_checked,
           (SELECT count(*)::int FROM media m WHERE m.place_id = p.id AND m.kind = 'image'
              AND m.status = 'verified') AS own_photos,
           (SELECT count(*)::int FROM review r WHERE r.place_id = p.id
              AND r.status = 'verified') AS own_reviews
    FROM place p
    WHERE p.slug = ${slug} AND p.status = 'verified'`);
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    location: [row.lng, row.lat],
    googlePlaceId: row.google_place_id,
    recentlyChecked: row.recently_checked,
    gaps: placeGaps(row.own_photos, row.own_reviews),
  };
}

async function saveGooglePlaceId(placeId: string, googlePlaceId: string | null): Promise<void> {
  await getDb().execute(sql`
    UPDATE place SET google_place_id = ${googlePlaceId}, google_place_checked_at = now()
    WHERE id = ${placeId}`);
}

/**
 * The place's Google place id: the stored one, or looked up once (free) and stored. Null when
 * Google has no such place, the key is not set, or the day's budget is used up.
 */
async function resolveGooglePlaceId(place: PlaceForGoogle): Promise<string | null> {
  if (place.googlePlaceId) return place.googlePlaceId;
  const google = getGooglePlacesProvider();
  if (!google || place.recentlyChecked || !(await takeGoogleBudget("ids"))) return null;
  let id: string | null;
  try {
    id = await google.findPlaceId(place.name, place.location);
  } catch (err) {
    // Google down or the key refused: links fall back to a name search; the next visit retries.
    console.error(`Google place id lookup failed for ${place.name}`, err);
    return null;
  }
  await saveGooglePlaceId(place.id, id);
  return id;
}

/** The Google place id of a verified place (looked up when not known yet); null if none. */
export async function getGooglePlaceId(
  slug: string,
): Promise<{ name: string; location: LngLat; googlePlaceId: string | null } | null> {
  const place = await loadPlace(slug);
  if (!place) return null;
  return {
    name: place.name,
    location: place.location,
    googlePlaceId: await resolveGooglePlaceId(place),
  };
}

export interface GoogleGapResult {
  googlePlaceId: string | null;
  /** Null when there is no gap, no Google place, or no budget left today. */
  fill: GoogleGapFill | null;
}

/** Google's photos, rating and reviews for the place's gaps, fetched live. Null for an unknown place. */
export async function getGoogleGapFill(slug: string): Promise<GoogleGapResult | null> {
  const place = await loadPlace(slug);
  if (!place) return null;
  const googlePlaceId = await resolveGooglePlaceId(place);
  const google = getGooglePlacesProvider();
  if (!google || !googlePlaceId || place.gaps.length === 0) return { googlePlaceId, fill: null };

  // Photos alone are free (Place Details IDs only); reviews make it Enterprise + Atmosphere.
  // With that budget used up, still fill the photos.
  let gaps = place.gaps;
  if (gaps.includes("reviews") && !(await takeGoogleBudget("details_atmosphere"))) {
    gaps = gaps.filter((g) => g !== "reviews");
  }
  if (gaps.length === 0 || (!gaps.includes("reviews") && !(await takeGoogleBudget("ids")))) {
    return { googlePlaceId, fill: null };
  }

  const fill = await google.details(googlePlaceId, gaps);
  if (!fill) {
    // Google dropped the id (places merge and move): forget it so the next visit looks again.
    await getDb().execute(sql`
      UPDATE place SET google_place_id = NULL, google_place_checked_at = NULL
      WHERE id = ${place.id}`);
    return { googlePlaceId: null, fill: null };
  }
  return { googlePlaceId, fill: { ...fill, photos: fill.photos.slice(0, GOOGLE_PHOTOS_MAX) } };
}
