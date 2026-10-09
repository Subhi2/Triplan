import { beforeEach, describe, expect, it, vi } from "vitest";
import { NoRouteError } from "@/server/providers/routing";

vi.mock("@/server/services/routeService", () => ({ getRoutes: vi.fn() }));
vi.mock("@/server/services/usage", () => ({ countLater: vi.fn() }));
const allowRequestOrOpen = vi.fn();
vi.mock("@/server/services/writeLimit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/services/writeLimit")>()),
  allowRequestOrOpen,
}));

const { getRoutes } = await import("@/server/services/routeService");
const { countLater } = await import("@/server/services/usage");
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
  beforeEach(() => {
    vi.mocked(getRoutes).mockReset();
    vi.mocked(countLater).mockReset();
    allowRequestOrOpen.mockReset().mockResolvedValue(true);
  });

  it("answers 429 once a visitor has planned too many routes, without routing", async () => {
    allowRequestOrOpen.mockResolvedValue(false);
    const res = await post(trip);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("3600");
    expect(getRoutes).not.toHaveBeenCalled();
  });

  it("counts a planned ride only when routing works", async () => {
    vi.mocked(getRoutes).mockResolvedValue([]);
    await post(trip);
    expect(countLater).toHaveBeenCalledWith("route_planned");
    vi.mocked(countLater).mockReset();
    vi.mocked(getRoutes).mockRejectedValue(new NoRouteError());
    await post(trip);
    expect(countLater).not.toHaveBeenCalled();
  });

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
