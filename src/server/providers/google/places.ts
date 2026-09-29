import { z } from "zod";
import type { GoogleAuthor, GoogleGapFill } from "@/lib/googleGap";
import { fetchJson, ProviderError } from "../http";
import type { GoogleGap, GooglePlacesProvider } from "./types";

// Places API (New). Every request names its fields (the field mask), which sets the SKU it is
// billed at: `places.id` and `photos` are free, `rating`/`reviews` are Enterprise + Atmosphere.
// Nothing returned here is stored except the place id (docs/02, "Google Maps Platform").

const API = "https://places.googleapis.com/v1";
/** Half the side of the search rectangle around our pin, in metres. */
const SEARCH_HALF_SIDE_M = 300;

const PLACE_ID = /^[A-Za-z0-9_-]+$/;
const PHOTO_NAME = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;

const FIELDS: Record<GoogleGap, string[]> = {
  photos: ["photos"],
  reviews: ["rating", "userRatingCount", "reviews", "googleMapsUri"],
};

const errorSchema = z.object({ error: z.object({ status: z.string().optional() }) }).partial();

export const searchSchema = z
  .object({ places: z.array(z.object({ id: z.string() })).optional() })
  .and(errorSchema);

const authorSchema = z.object({
  displayName: z.string().default(""),
  uri: z.string().optional(),
  photoUri: z.string().optional(),
});

export const detailsSchema = z
  .object({
    id: z.string().optional(),
    googleMapsUri: z.string().optional(),
    rating: z.number().optional(),
    userRatingCount: z.number().int().optional(),
    reviews: z
      .array(
        z.object({
          rating: z.number(),
          text: z.object({ text: z.string() }).optional(),
          relativePublishTimeDescription: z.string().default(""),
          authorAttribution: authorSchema.optional(),
        }),
      )
      .optional(),
    photos: z
      .array(
        z.object({
          name: z.string(),
          widthPx: z.number().int(),
          heightPx: z.number().int(),
          authorAttributions: z.array(authorSchema).default([]),
        }),
      )
      .optional(),
  })
  .and(errorSchema);

export const photoSchema = z.object({ photoUri: z.string().optional() }).and(errorSchema);

/** Google gives some links without a scheme ("//maps.google.com/..."). */
export function absoluteUrl(url: string | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("//")) return `https:${url}`;
  return /^https:\/\//.test(url) ? url : null;
}

function author(a: z.infer<typeof authorSchema> | undefined): GoogleAuthor {
  return {
    displayName: a?.displayName || "A Google user",
    uri: absoluteUrl(a?.uri),
    photoUri: absoluteUrl(a?.photoUri),
  };
}

export function parseDetails(data: z.infer<typeof detailsSchema>): GoogleGapFill {
  return {
    googleMapsUri: absoluteUrl(data.googleMapsUri),
    rating: data.rating ?? null,
    ratingCount: data.userRatingCount ?? null,
    reviews: (data.reviews ?? []).map((r) => ({
      author: author(r.authorAttribution),
      rating: r.rating,
      text: r.text?.text.trim() || null,
      relativeTime: r.relativePublishTimeDescription,
    })),
    photos: (data.photos ?? [])
      .filter((p) => PHOTO_NAME.test(p.name))
      .map((p) => ({
        name: p.name,
        widthPx: p.widthPx,
        heightPx: p.heightPx,
        authors: p.authorAttributions.map(author),
      })),
  };
}

/** The Text Search restriction: a rectangle of about 600 m around [lng, lat]. */
export function searchRectangle([lng, lat]: [number, number]) {
  const dLat = SEARCH_HALF_SIDE_M / 111_320;
  const dLng = dLat / Math.cos((lat * Math.PI) / 180);
  return {
    rectangle: {
      low: { latitude: lat - dLat, longitude: lng - dLng },
      high: { latitude: lat + dLat, longitude: lng + dLng },
    },
  };
}

export const isPhotoName = (name: string) => PHOTO_NAME.test(name);

export function createGooglePlacesProvider(apiKey: string): GooglePlacesProvider {
  const headers = (fields: string[]) => ({
    "X-Goog-Api-Key": apiKey,
    "X-Goog-FieldMask": fields.join(","),
    "Content-Type": "application/json",
  });

  function fail(what: string, status: number, error: { status?: string } | undefined): never {
    throw new ProviderError(
      `Google ${what} failed: HTTP ${status} ${error?.status ?? ""}`.trim(),
      "google",
      status,
    );
  }

  return {
    async findPlaceId(name, location) {
      const { status, data } = await fetchJson("google", `${API}/places:searchText`, searchSchema, {
        method: "POST",
        headers: headers(["places.id"]),
        body: JSON.stringify({
          textQuery: name,
          locationRestriction: searchRectangle(location),
          languageCode: "en",
          regionCode: "in",
          pageSize: 1,
        }),
      });
      if (status !== 200) fail("Text Search", status, data.error);
      const id = data.places?.[0]?.id;
      return id && PLACE_ID.test(id) ? id : null;
    },

    async details(placeId, gaps) {
      if (!PLACE_ID.test(placeId)) throw new Error(`Not a Google place id: ${placeId}`);
      const fields = [...new Set(gaps.flatMap((g) => FIELDS[g]))];
      if (fields.length === 0) throw new Error("No gap to fill");
      const url = `${API}/places/${placeId}?languageCode=en&regionCode=in`;
      const { status, data } = await fetchJson("google", url, detailsSchema, {
        headers: headers(fields),
      });
      if (status === 404) return null; // the id is gone; the caller looks the place up again
      if (status !== 200) fail("Place Details", status, data.error);
      return parseDetails(data);
    },

    async photoUri(photoName, maxWidthPx) {
      if (!PHOTO_NAME.test(photoName)) throw new Error(`Not a Google photo name: ${photoName}`);
      const url = `${API}/${photoName}/media?maxWidthPx=${maxWidthPx}&skipHttpRedirect=true`;
      const { status, data } = await fetchJson("google", url, photoSchema, {
        headers: { "X-Goog-Api-Key": apiKey },
      });
      const uri = absoluteUrl(data.photoUri);
      if (status !== 200 || !uri) fail("Place Photo", status, data.error);
      return uri;
    },
  };
}
