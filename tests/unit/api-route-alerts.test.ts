import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/services/alertsService", () => ({ alertsAlongRoute: vi.fn() }));
vi.mock("@/server/services/routeService", () => ({ getRouteGeometry: vi.fn() }));
vi.mock("@/server/providers/alerts", () => ({ getAlertsProvider: () => "provider" }));
vi.mock("@/server/services/writeLimit", () => ({
  allowRequestOrOpen: vi.fn(),
  REQUEST_LIMITS: { alerts: { scope: "alerts", limit: 120, windowS: 3600 } },
}));

const { alertsAlongRoute } = await import("@/server/services/alertsService");
const { getRouteGeometry } = await import("@/server/services/routeService");
const { allowRequestOrOpen } = await import("@/server/services/writeLimit");
const { POST } = await import("@/app/api/route/alerts/route");

const line = {
  type: "LineString" as const,
  coordinates: [
    [77.59, 12.97],
    [75.36, 13.23],
  ] as [number, number][],
};
const routeId = `${"a".repeat(32)}-0`;
const result = { alerts: [], partial: false };

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/route/alerts", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );

describe("POST /api/route/alerts", () => {
  beforeEach(() => {
    vi.mocked(alertsAlongRoute).mockReset().mockResolvedValue(result);
    vi.mocked(getRouteGeometry).mockReset();
    vi.mocked(allowRequestOrOpen).mockReset().mockResolvedValue(true);
  });

  it("checks the cached route by id", async () => {
    vi.mocked(getRouteGeometry).mockResolvedValue(line);
    const res = await post({ routeId });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(result);
    expect(alertsAlongRoute).toHaveBeenCalledWith(line, "provider");
  });

  it("takes a geometry, and says ROUTE_NOT_FOUND for an expired id", async () => {
    expect((await post({ geometry: line })).status).toBe(200);
    vi.mocked(getRouteGeometry).mockResolvedValue(null);
    const res = await post({ routeId });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "ROUTE_NOT_FOUND" });
  });

  it("rejects a bad request and a visitor over the limit", async () => {
    expect((await post({})).status).toBe(400);
    vi.mocked(allowRequestOrOpen).mockResolvedValue(false);
    expect((await post({ geometry: line })).status).toBe(429);
    expect(alertsAlongRoute).not.toHaveBeenCalled();
  });

  it("is 502 when the alerts cannot be read", async () => {
    vi.mocked(alertsAlongRoute).mockRejectedValue(new Error("down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await post({ geometry: line })).status).toBe(502);
  });
});
