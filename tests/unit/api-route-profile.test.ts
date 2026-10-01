import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/services/elevationService", () => ({ routeProfile: vi.fn() }));
vi.mock("@/server/services/routeService", () => ({ getRouteGeometry: vi.fn() }));

const { routeProfile } = await import("@/server/services/elevationService");
const { getRouteGeometry } = await import("@/server/services/routeService");
const { POST } = await import("@/app/api/route/profile/route");

const line = {
  type: "LineString" as const,
  coordinates: [
    [77.59, 12.97],
    [75.36, 13.23],
  ] as [number, number][],
};
const routeId = `${"a".repeat(32)}-0`;
const profile = { v: 1, zoom: 12, points: [], ascentM: 900, descentM: 0, climbs: [] };

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/route/profile", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /api/route/profile", () => {
  beforeEach(() => {
    vi.mocked(routeProfile)
      .mockReset()
      .mockResolvedValue(profile as never);
    vi.mocked(getRouteGeometry).mockReset();
  });

  it("loads the route by id and caches its profile under that id", async () => {
    vi.mocked(getRouteGeometry).mockResolvedValue(line);
    const res = await post({ routeId });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ profile });
    expect(routeProfile).toHaveBeenCalledWith(line, routeId);
  });

  it("takes a geometry when the route id has expired", async () => {
    const res = await post({ geometry: line });
    expect(res.status).toBe(200);
    expect(routeProfile).toHaveBeenCalledWith(line, null);
  });

  it("returns 404 ROUTE_NOT_FOUND for an unknown route id", async () => {
    vi.mocked(getRouteGeometry).mockResolvedValue(null);
    const res = await post({ routeId });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "ROUTE_NOT_FOUND" });
  });

  it("rejects a request with neither", async () => {
    expect((await post({})).status).toBe(400);
    expect((await post({ routeId: "nope" })).status).toBe(400);
  });

  it("answers null when the terrain could not be read", async () => {
    vi.mocked(routeProfile).mockResolvedValue(null);
    const res = await post({ geometry: line });
    expect(await res.json()).toEqual({ profile: null });
  });
});
