import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/services/corridorService", () => ({
  placesAlong: vi.fn(),
  toPlaceAlong: (r: unknown) => r,
}));
vi.mock("@/server/services/routeService", () => ({ getRouteGeometry: vi.fn() }));

const { placesAlong } = await import("@/server/services/corridorService");
const { getRouteGeometry } = await import("@/server/services/routeService");
const { POST } = await import("@/app/api/places/along/route");

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
    vi.mocked(getRouteGeometry).mockReset();
  });

  it("loads the geometry for a route id and queries the corridor in metres", async () => {
    vi.mocked(getRouteGeometry).mockResolvedValue(line);
    const res = await post({ routeId, corridorKm: 5 });
    expect(res.status).toBe(200);
    expect(getRouteGeometry).toHaveBeenCalledWith(routeId);
    expect(placesAlong).toHaveBeenCalledWith(line, 5_000, null);
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

  it("rejects invalid bodies with 400", async () => {
    expect((await post({ corridorKm: 5 })).status).toBe(400);
    expect((await post({ geometry: line, corridorKm: 3 })).status).toBe(400);
    expect(placesAlong).not.toHaveBeenCalled();
  });
});
