import { describe, expect, it, vi } from "vitest";
import { MY_LOCATION, myLocationLabel } from "@/lib/nearby";

const nearestTown = vi.fn();
vi.mock("@/server/services/corridorService", () => ({ nearestTown }));
const { GET } = await import("@/app/api/places/near-town/route");

const get = (q: string) => GET(new Request(`http://localhost/api/places/near-town?${q}`));

describe("GET /api/places/near-town", () => {
  it("rounds the position to 3 decimals and never lets it be cached", async () => {
    nearestTown.mockResolvedValue("Hassan");
    const res = await get("lng=76.099612&lat=13.007234");
    expect(await res.json()).toEqual({ town: "Hassan" });
    expect(nearestTown).toHaveBeenCalledWith([76.1, 13.007]);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("refuses a bad position and answers null when the lookup fails", async () => {
    expect((await get("lng=500&lat=1")).status).toBe(400);
    vi.spyOn(console, "error").mockImplementation(() => {});
    nearestTown.mockRejectedValue(new Error("db down"));
    expect(await (await get("lng=76&lat=13")).json()).toEqual({ town: null });
  });
});

describe("myLocationLabel", () => {
  it("names the position by its town, else 'My location'", () => {
    expect(myLocationLabel("Hassan")).toBe("Near Hassan");
    expect(myLocationLabel(null)).toBe(MY_LOCATION);
  });
});
