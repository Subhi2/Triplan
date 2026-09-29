import { afterEach, describe, expect, it, vi } from "vitest";
import {
  absoluteUrl,
  createGooglePlacesProvider,
  detailsSchema,
  parseDetails,
  searchRectangle,
} from "@/server/providers/google/places";
import { jsonFixture } from "../helpers/fixtures";

// tests/fixtures/google follows the documented Places API (New) format (see its README).

describe("parseDetails", () => {
  const fill = parseDetails(detailsSchema.parse(jsonFixture("google/details-reviews-photos.json")));

  it("keeps the rating, count and Maps link", () => {
    expect(fill).toMatchObject({
      googleMapsUri: "https://maps.google.com/?cid=1234567890",
      rating: 4.4,
      ratingCount: 11873,
    });
  });

  it("credits each review's author, with scheme-less links made https", () => {
    expect(fill.reviews[0]).toEqual({
      author: {
        displayName: "Ravi K",
        uri: "https://www.google.com/maps/contrib/100000000000000000001/reviews",
        photoUri: "https://lh3.googleusercontent.com/a/example=s128-c0x00000000-cc-rp-mo",
      },
      rating: 5,
      text: "Star shaped fort right off NH75. Go early, the view of the ghats is great.",
      relativeTime: "2 months ago",
    });
    expect(fill.reviews[1]).toMatchObject({ author: { displayName: "A Google user" }, text: null });
  });

  it("keeps photos with their authors and drops malformed photo names", () => {
    expect(fill.photos).toEqual([
      {
        name: "places/ChIJexampleManjarabad0/photos/AUc7tXexamplePhoto1",
        widthPx: 4032,
        heightPx: 3024,
        authors: [
          {
            displayName: "Meera S",
            uri: "https://maps.google.com/maps/contrib/100000000000000000003",
            photoUri: "https://lh3.googleusercontent.com/a-/example=s100-p-k-no-mo",
          },
        ],
      },
    ]);
  });

  it("leaves out what was not asked for", () => {
    expect(parseDetails(detailsSchema.parse({ photos: [] }))).toEqual({
      googleMapsUri: null,
      rating: null,
      ratingCount: null,
      reviews: [],
      photos: [],
    });
  });
});

describe("helpers", () => {
  it("only accepts https links", () => {
    expect(absoluteUrl("//a.example/x")).toBe("https://a.example/x");
    expect(absoluteUrl("http://a.example/x")).toBeNull();
    expect(absoluteUrl("javascript:alert(1)")).toBeNull();
    expect(absoluteUrl(undefined)).toBeNull();
  });

  it("searches a square of about 600 m around the pin", () => {
    const { low, high } = searchRectangle([75.7324, 12.8911]).rectangle;
    expect((high.latitude - low.latitude) * 111_320).toBeCloseTo(600, 0);
    const kmPerLng = 111.32 * Math.cos((12.8911 * Math.PI) / 180);
    expect((high.longitude - low.longitude) * kmPerLng * 1000).toBeCloseTo(600, 0);
  });
});

describe("Google Places provider", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const google = createGooglePlacesProvider("test-key");
  const reply = (status: number, body: unknown) =>
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetchMock);
  afterEach(() => fetchMock.mockReset());

  const header = (name: string) => new Headers(fetchMock.mock.calls[0]![1]!.headers).get(name);

  it("looks up the place id with an ID-only field mask inside the rectangle", async () => {
    reply(200, { places: [{ id: "ChIJabc_123" }] });
    expect(await google.findPlaceId("Manjarabad Fort", [75.7324, 12.8911])).toBe("ChIJabc_123");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://places.googleapis.com/v1/places:searchText");
    expect(header("X-Goog-FieldMask")).toBe("places.id");
    expect(header("X-Goog-Api-Key")).toBe("test-key");
    expect(JSON.parse(String(init!.body))).toMatchObject({
      textQuery: "Manjarabad Fort",
      locationRestriction: { rectangle: {} },
      pageSize: 1,
    });
  });

  it("finds nothing when Google has no place there", async () => {
    reply(200, {});
    expect(await google.findPlaceId("Nowhere", [75, 12])).toBeNull();
  });

  it("asks only for the fields of the gaps", async () => {
    reply(200, { photos: [] });
    await google.details("ChIJabc_123", ["photos"]);
    expect(header("X-Goog-FieldMask")).toBe("photos");
    fetchMock.mockReset();

    reply(200, {});
    await google.details("ChIJabc_123", ["photos", "reviews"]);
    expect(header("X-Goog-FieldMask")).toBe("photos,rating,userRatingCount,reviews,googleMapsUri");
    expect(fetchMock.mock.calls[0]![0]).toBe(
      "https://places.googleapis.com/v1/places/ChIJabc_123?languageCode=en&regionCode=in",
    );
  });

  it("returns null for an id Google no longer knows, and throws on other errors", async () => {
    reply(404, { error: { code: 404, status: "NOT_FOUND" } });
    expect(await google.details("ChIJgone", ["photos"])).toBeNull();
    reply(403, { error: { code: 403, status: "PERMISSION_DENIED" } });
    await expect(google.details("ChIJabc", ["photos"])).rejects.toThrow(/PERMISSION_DENIED/);
  });

  it("refuses ids and photo names that are not Google's", async () => {
    await expect(google.details("../../x", ["photos"])).rejects.toThrow();
    await expect(google.photoUri("places/x/../../y", 800)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("gets a photo's short-lived URL without following the redirect", async () => {
    reply(200, {
      name: "places/ChIJabc/photos/P1/media",
      photoUri: "https://lh3.googleusercontent.com/p/x=w800",
    });
    expect(await google.photoUri("places/ChIJabc/photos/P1", 800)).toBe(
      "https://lh3.googleusercontent.com/p/x=w800",
    );
    expect(fetchMock.mock.calls[0]![0]).toBe(
      "https://places.googleapis.com/v1/places/ChIJabc/photos/P1/media?maxWidthPx=800&skipHttpRedirect=true",
    );
  });
});
