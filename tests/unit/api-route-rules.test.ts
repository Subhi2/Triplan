import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/services/roadRuleService", () => ({ rulesAlongRoute: vi.fn() }));
vi.mock("@/server/services/routeService", () => ({ getRouteResult: vi.fn() }));

const { rulesAlongRoute } = await import("@/server/services/roadRuleService");
const { getRouteResult } = await import("@/server/services/routeService");
const { POST } = await import("@/app/api/route/rules/route");

const line = {
  type: "LineString" as const,
  coordinates: [
    [77.59, 12.97],
    [76.7, 11.41],
  ] as [number, number][],
};
const routeId = `${"b".repeat(32)}-0`;

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/route/rules", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );

describe("POST /api/route/rules", () => {
  beforeEach(() => {
    vi.mocked(rulesAlongRoute).mockReset().mockResolvedValue([]);
    vi.mocked(getRouteResult).mockReset().mockResolvedValue(null);
  });

  it("sends the cached route's rules with its timeline", async () => {
    vi.mocked(getRouteResult).mockResolvedValue({
      geometry: line,
      distanceM: 300_000,
      durationS: 18_000,
      legs: [],
      roads: [
        { distanceM: 100_000, durationS: 4_000, ref: "NH275" },
        { distanceM: 200_000, durationS: 14_000, ref: "NH181" },
      ],
    } as never);
    const res = await post({ routeId });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { timeline: { km: number[]; min: number[] } };
    expect(rulesAlongRoute).toHaveBeenCalledWith(line);
    expect(body.timeline.km).toEqual([0, 100, 300]);
    expect(body.timeline.min.map(Math.round)).toEqual([0, 67, 300]);
  });

  it("takes a geometry without a timeline, and says ROUTE_NOT_FOUND for an expired id", async () => {
    const res = await post({ geometry: line });
    expect(await res.json()).toEqual({ rules: [], timeline: null });
    const gone = await post({ routeId });
    expect(gone.status).toBe(404);
    expect(await gone.json()).toMatchObject({ code: "ROUTE_NOT_FOUND" });
  });

  it("rejects a bad request and is 502 when the database fails", async () => {
    expect((await post({})).status).toBe(400);
    vi.mocked(rulesAlongRoute).mockRejectedValue(new Error("down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await post({ geometry: line })).status).toBe(502);
  });
});
