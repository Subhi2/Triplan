import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/services/nearbyService", () => ({ findNearby: vi.fn() }));

const { findNearby } = await import("@/server/services/nearbyService");
const { GET } = await import("@/app/api/places/near/route");

const get = (query: string) => GET(new Request(`http://localhost/api/places/near?${query}`));

describe("GET /api/places/near", () => {
  beforeEach(() => {
    vi.mocked(findNearby)
      .mockReset()
      .mockResolvedValue({ places: [], roadTimes: "osrm", radiusKm: 60 });
  });

  it("passes the position rounded to 3 decimals", async () => {
    const res = await get("lng=75.785123&lat=12.943456&within=120&vehicle=car");
    expect(res.status).toBe(200);
    expect(findNearby).toHaveBeenCalledWith({
      lng: 75.785,
      lat: 12.943,
      within: 120,
      vehicle: "car",
      mode: "reach",
    });
  });

  it("is never cached", async () => {
    const res = await get("lng=75.785&lat=12.943");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("rejects bad input", async () => {
    const res = await get("lng=75.785&lat=12.943&within=45");
    expect(res.status).toBe(400);
    expect(findNearby).not.toHaveBeenCalled();
  });

  it("keeps the position out of the error log", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const dbError = Object.assign(new Error("connection terminated"), {
      parameters: [75.785, 12.943],
    });
    vi.mocked(findNearby).mockRejectedValue(dbError);
    const res = await get("lng=75.785&lat=12.943");
    expect(res.status).toBe(500);
    expect(JSON.stringify(error.mock.calls)).not.toContain("75.785");
    error.mockRestore();
  });
});
