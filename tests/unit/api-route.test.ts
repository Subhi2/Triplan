import { beforeEach, describe, expect, it, vi } from "vitest";
import { NoRouteError } from "@/server/providers/routing";

vi.mock("@/server/services/routeService", () => ({ getRoutes: vi.fn() }));

const { getRoutes } = await import("@/server/services/routeService");
const { POST } = await import("@/app/api/route/route");

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/route", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

const trip = {
  stops: [
    { label: "Bengaluru", location: [77.5946, 12.9716] },
    { label: "Kalasa", location: [75.356, 13.234] },
  ],
};

describe("POST /api/route", () => {
  beforeEach(() => vi.mocked(getRoutes).mockReset());

  it("rejects invalid trips with 400", async () => {
    expect((await post("not json")).status).toBe(400);
    expect((await post({ stops: [trip.stops[0]] })).status).toBe(400);
    expect(
      (await post({ stops: [{ label: "X", location: [200, 13] }, trip.stops[1]] })).status,
    ).toBe(400);
    expect(getRoutes).not.toHaveBeenCalled();
  });

  it("defaults the vehicle to bike and returns routes", async () => {
    vi.mocked(getRoutes).mockResolvedValue([]);
    const res = await post(trip);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ routes: [] });
    expect(getRoutes).toHaveBeenCalledWith({ ...trip, vehicle: "bike" });
  });

  it("maps no-route to 404 and provider failures to 502", async () => {
    vi.mocked(getRoutes).mockRejectedValueOnce(new NoRouteError());
    expect((await post(trip)).status).toBe(404);

    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getRoutes).mockRejectedValueOnce(new Error("boom"));
    expect((await post(trip)).status).toBe(502);
  });
});
