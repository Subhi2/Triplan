import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/services/suggestService", () => ({ suggestPlaces: vi.fn() }));
vi.mock("@/server/providers/geocoding", () => {
  const search = vi.fn();
  return { getGeocodingProvider: () => ({ search }), __search: search };
});

const { suggestPlaces } = await import("@/server/services/suggestService");
const geocoding = (await import("@/server/providers/geocoding")) as unknown as {
  __search: ReturnType<typeof vi.fn>;
};
const { GET } = await import("@/app/api/geocode/route");

const get = (qs: string) => GET(new Request(`http://localhost/api/geocode?${qs}`));

describe("GET /api/geocode", () => {
  beforeEach(() => {
    vi.mocked(suggestPlaces).mockReset().mockResolvedValue([]);
    geocoding.__search.mockReset().mockResolvedValue([]);
  });

  it("suggests by default, biased to the map centre and zoom", async () => {
    const res = await get("q=samse&lat=15.05&lon=76.75&zoom=5");
    expect(res.status).toBe(200);
    expect(suggestPlaces).toHaveBeenCalledWith("samse", { near: [76.75, 15.05], zoom: 5 });
    expect(geocoding.__search).not.toHaveBeenCalled();
  });

  it("clamps the zoom hint instead of failing (a small map fits India below zoom 0)", async () => {
    const res = await get("q=kalasa&lat=21.9&lon=82.7&zoom=-2");
    expect(res.status).toBe(200);
    expect(suggestPlaces).toHaveBeenCalledWith("kalasa", { near: [82.7, 21.9], zoom: 0 });
  });

  it("suggests without a bias when the map position is missing", async () => {
    await get("q=ooty&source=suggest");
    expect(suggestPlaces).toHaveBeenCalledWith("ooty", { near: undefined, zoom: undefined });
  });

  it("falls back to Nominatim for source=osm (Enter)", async () => {
    geocoding.__search.mockResolvedValue([
      {
        id: "node/1",
        name: "Samse",
        label: "Samse, Karnataka",
        location: [75.33, 13.19],
        kind: "place/village",
      },
    ]);
    const res = await get("q=samse&source=osm");
    expect(await res.json()).toEqual({
      results: [
        {
          id: "node/1",
          name: "Samse",
          label: "Samse, Karnataka",
          location: [75.33, 13.19],
          source: "osm",
        },
      ],
    });
    expect(suggestPlaces).not.toHaveBeenCalled();
  });

  it("rejects short queries and bad coordinates", async () => {
    expect((await get("q=s")).status).toBe(400);
    expect((await get("q=samse&lat=95&lon=76")).status).toBe(400);
    expect((await get("q=samse&source=local")).status).toBe(400);
  });
});
