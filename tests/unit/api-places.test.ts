import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/services/corridorService", () => ({
  placesAlong: vi.fn(),
  toPlaceAlong: (r: unknown) => r,
}));
vi.mock("@/server/services/routeService", () => ({ getRouteGeometry: vi.fn() }));
vi.mock("@/server/services/openPlaceService", () => ({ openPlacesAlong: vi.fn() }));

const { placesAlong } = await import("@/server/services/corridorService");
const { openPlacesAlong } = await import("@/server/services/openPlaceService");
const { getRouteGeometry } = await import("@/server/services/routeService");
const { POST } = await import("@/app/api/places/along/route");
const { PLACE_LIST_CATEGORIES } = await import("@/lib/categories");

const line = {
  type: "LineString" as const,
  coordinates: [
    [77.59, 12.97],
    [75.36, 13.23],
  ] as [number, number][],
};
const routeId = `${"0".repeat(32)}-1`;

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/places/along", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /api/places/along", () => {
  beforeEach(() => {
    vi.mocked(placesAlong).mockReset().mockResolvedValue([]);
    vi.mocked(openPlacesAlong).mockReset().mockResolvedValue([]);
    vi.mocked(getRouteGeometry).mockReset();
  });

  it("loads the geometry for a route id and queries the corridor in metres", async () => {
    vi.mocked(getRouteGeometry).mockResolvedValue(line);
    const res = await post({ routeId, corridorKm: 5 });
    expect(res.status).toBe(200);
    expect(getRouteGeometry).toHaveBeenCalledWith(routeId);
    expect(placesAlong).toHaveBeenCalledWith(line, 5_000, PLACE_LIST_CATEGORIES);
  });

  it("leaves fuel stations and towns out of the default list", async () => {
    await post({ geometry: line, corridorKm: 5 });
    const categories = vi.mocked(placesAlong).mock.calls[0]![2]!;
    expect(categories).toContain("temple");
    expect(categories).not.toContain("fuel");
    expect(categories).not.toContain("town");
  });

  it("returns 404 ROUTE_NOT_FOUND for an expired route id", async () => {
    vi.mocked(getRouteGeometry).mockResolvedValue(null);
    const res = await post({ routeId, corridorKm: 5 });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "ROUTE_NOT_FOUND" });
  });

  it("accepts a geometry directly, with a category filter", async () => {
    await post({ geometry: line, corridorKm: 10, categories: ["fort"] });
    expect(getRouteGeometry).not.toHaveBeenCalled();
    expect(placesAlong).toHaveBeenCalledWith(line, 10_000, ["fort"]);
  });

  it("adds open places only when asked, marked and in km order", async () => {
    const row = (id: string, km: number) =>
      ({ id, kmFromStart: km }) as Awaited<ReturnType<typeof placesAlong>>[number];
    vi.mocked(placesAlong).mockResolvedValue([row("ours-10", 10), row("ours-50", 50)]);
    vi.mocked(openPlacesAlong).mockResolvedValue([row("open-30", 30)]);

    const plain = await post({ geometry: line, corridorKm: 2, categories: ["fuel"] });
    expect(openPlacesAlong).not.toHaveBeenCalled();
    expect((await plain.json()).places).toHaveLength(2);

    const res = await post({
      geometry: line,
      corridorKm: 2,
      categories: ["fuel"],
      openPlaces: true,
    });
    expect(openPlacesAlong).toHaveBeenCalledWith(line, 2_000, ["fuel"]);
    const { places } = (await res.json()) as { places: { id: string; open?: true }[] };
    expect(places.map((p) => p.id)).toEqual(["ours-10", "open-30", "ours-50"]);
    expect(places.map((p) => p.open ?? false)).toEqual([false, true, false]);
  });

  it("never adds open places to the default list", async () => {
    await post({ geometry: line, corridorKm: 5, openPlaces: true });
    expect(openPlacesAlong).not.toHaveBeenCalled();
  });

  it("rejects invalid bodies with 400", async () => {
    expect((await post({ corridorKm: 5 })).status).toBe(400);
    expect((await post({ geometry: line, corridorKm: 3 })).status).toBe(400);
    expect(placesAlong).not.toHaveBeenCalled();
  });
});
