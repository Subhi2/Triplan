import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GoogleGapFill } from "@/lib/googleGap";
import { googleMapsPlaceUrl, placeGoogleMapsHref } from "@/lib/googleMaps";

// The database, the Google provider and the budget are mocked: these tests check which Google
// calls are made (and paid for) for which gaps.

const execute = vi.fn();
vi.mock("@/server/db", () => ({ getDb: () => ({ execute }) }));
const google = { findPlaceId: vi.fn(), details: vi.fn(), photoUri: vi.fn() };
let googleKeySet = true;
vi.mock("@/server/providers/google", () => ({
  getGooglePlacesProvider: () => (googleKeySet ? google : null),
}));
const takeGoogleBudget = vi.fn();
vi.mock("@/server/providers/google/budget", () => ({ takeGoogleBudget }));

const { getGoogleGapFill, getGooglePlaceId, placeGaps } =
  await import("@/server/services/googleGapService");

const row = (over: Record<string, unknown> = {}) => ({
  id: "p1",
  name: "Manjarabad Fort",
  lng: 75.7581,
  lat: 12.9173,
  google_place_id: "ChIJfort",
  recently_checked: false,
  own_photos: 0,
  own_reviews: 0,
  ...over,
});

const fill: GoogleGapFill = {
  googleMapsUri: null,
  rating: 4.4,
  ratingCount: 100,
  reviews: [],
  photos: Array.from({ length: 8 }, (_, i) => ({
    name: `places/ChIJfort/photos/P${i}`,
    widthPx: 800,
    heightPx: 600,
    authors: [],
  })),
};

beforeEach(() => {
  googleKeySet = true;
  execute.mockReset().mockResolvedValue([]);
  for (const f of Object.values(google)) f.mockReset();
  takeGoogleBudget.mockReset().mockResolvedValue(true);
  google.details.mockResolvedValue(fill);
});

describe("placeGaps", () => {
  it("wants photos only without our own, reviews below 3 of our own", () => {
    expect(placeGaps(0, 0)).toEqual(["photos", "reviews"]);
    expect(placeGaps(2, 2)).toEqual(["reviews"]);
    expect(placeGaps(0, 3)).toEqual(["photos"]);
    expect(placeGaps(1, 3)).toEqual([]);
  });
});

describe("getGoogleGapFill", () => {
  it("is null for an unknown place", async () => {
    expect(await getGoogleGapFill("nowhere")).toBeNull();
    expect(google.details).not.toHaveBeenCalled();
  });

  it("makes no Google call for a place with our own photos and reviews", async () => {
    execute.mockResolvedValueOnce([row({ own_photos: 2, own_reviews: 5 })]);
    expect(await getGoogleGapFill("manjarabad-fort")).toEqual({
      googlePlaceId: "ChIJfort",
      fill: null,
    });
    expect(google.details).not.toHaveBeenCalled();
    expect(takeGoogleBudget).not.toHaveBeenCalled();
  });

  it("asks for photos alone (free) when only photos are missing", async () => {
    execute.mockResolvedValueOnce([row({ own_reviews: 4 })]);
    await getGoogleGapFill("manjarabad-fort");
    expect(google.details).toHaveBeenCalledWith("ChIJfort", ["photos"]);
    expect(takeGoogleBudget.mock.calls).toEqual([["ids"]]);
  });

  it("asks for both gaps in one request and keeps at most 5 photos", async () => {
    execute.mockResolvedValueOnce([row()]);
    const result = await getGoogleGapFill("manjarabad-fort");
    expect(google.details).toHaveBeenCalledTimes(1);
    expect(google.details).toHaveBeenCalledWith("ChIJfort", ["photos", "reviews"]);
    expect(takeGoogleBudget.mock.calls).toEqual([["details_atmosphere"]]);
    expect(result?.fill?.photos).toHaveLength(5);
  });

  it("still fills photos when the reviews budget is used up", async () => {
    execute.mockResolvedValueOnce([row()]);
    takeGoogleBudget.mockImplementation(async (sku: string) => sku !== "details_atmosphere");
    await getGoogleGapFill("manjarabad-fort");
    expect(google.details).toHaveBeenCalledWith("ChIJfort", ["photos"]);
  });

  it("makes no call when the day's budget is used up", async () => {
    execute.mockResolvedValueOnce([row({ own_photos: 3 })]);
    takeGoogleBudget.mockResolvedValue(false);
    expect(await getGoogleGapFill("manjarabad-fort")).toEqual({
      googlePlaceId: "ChIJfort",
      fill: null,
    });
    expect(google.details).not.toHaveBeenCalled();
  });

  it("looks the id up once and stores it", async () => {
    execute.mockResolvedValueOnce([row({ google_place_id: null })]);
    google.findPlaceId.mockResolvedValue("ChIJnew");
    const result = await getGoogleGapFill("manjarabad-fort");
    expect(google.findPlaceId).toHaveBeenCalledWith("Manjarabad Fort", [75.7581, 12.9173]);
    expect(result?.googlePlaceId).toBe("ChIJnew");
    const stored = execute.mock.calls[1]![0].queryChunks.flatMap((c: unknown) => c);
    expect(stored).toContain("ChIJnew");
  });

  it("does not look again soon after finding nothing", async () => {
    execute.mockResolvedValueOnce([row({ google_place_id: null, recently_checked: true })]);
    expect(await getGoogleGapFill("manjarabad-fort")).toEqual({ googlePlaceId: null, fill: null });
    expect(google.findPlaceId).not.toHaveBeenCalled();
  });

  it("forgets an id Google no longer knows", async () => {
    execute.mockResolvedValueOnce([row()]);
    google.details.mockResolvedValue(null);
    expect(await getGoogleGapFill("manjarabad-fort")).toEqual({ googlePlaceId: null, fill: null });
    expect(execute).toHaveBeenCalledTimes(2); // the SELECT, then clearing the id
  });

  it("does nothing without the server key", async () => {
    googleKeySet = false;
    execute.mockResolvedValueOnce([row({ google_place_id: null })]);
    expect(await getGoogleGapFill("manjarabad-fort")).toEqual({ googlePlaceId: null, fill: null });
    expect(takeGoogleBudget).not.toHaveBeenCalled();
  });
});

describe("Google Maps links", () => {
  const fort = {
    slug: "manjarabad-fort",
    name: "Manjarabad Fort",
    location: [75.7581, 12.9173] as [number, number],
  };

  it("opens the exact place once its id is known", async () => {
    expect(googleMapsPlaceUrl({ ...fort, googlePlaceId: "ChIJfort" })).toBe(
      "https://www.google.com/maps/search/?api=1&query=Manjarabad+Fort&query_place_id=ChIJfort",
    );
  });

  it("goes through our lookup only when Google is set up and the id is unknown", () => {
    expect(placeGoogleMapsHref(fort, true)).toBe("/api/places/manjarabad-fort/google-maps");
    expect(placeGoogleMapsHref(fort, false)).toBe(googleMapsPlaceUrl(fort));
    expect(placeGoogleMapsHref({ ...fort, googlePlaceId: "ChIJfort" }, true)).toContain(
      "query_place_id=ChIJfort",
    );
  });

  it("redirects to the looked-up place", async () => {
    execute.mockResolvedValueOnce([row()]);
    expect(await getGooglePlaceId("manjarabad-fort")).toEqual({
      name: "Manjarabad Fort",
      location: [75.7581, 12.9173],
      googlePlaceId: "ChIJfort",
    });
  });
});
