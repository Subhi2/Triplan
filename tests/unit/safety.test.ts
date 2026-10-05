import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  longestGap,
  summariseSafety,
  telLink,
  thinByStretch,
  type SafetyPoint,
} from "@/lib/safety";

const point = (id: string, kind: SafetyPoint["kind"], km: number, detourKm = 0.2): SafetyPoint => ({
  id,
  kind,
  name: id,
  phone: null,
  location: [75, 13],
  kmFromStart: km,
  detourKm,
});

describe("safety stops", () => {
  it("finds the longest stretch without one, from start to destination", () => {
    expect(longestGap([20, 30, 110], 150)).toEqual({ fromKm: 30, toKm: 110, km: 80 });
    expect(longestGap([], 90)).toEqual({ fromKm: 0, toKm: 90, km: 90 });
  });

  it("keeps the nearest few of each kind per 10 km", () => {
    const points = [
      point("a", "atm", 1, 2.5),
      point("b", "atm", 2, 0.1),
      point("c", "atm", 3, 1),
      point("d", "atm", 4, 0.5),
      point("h", "hospital", 5),
      point("e", "atm", 15),
    ];
    expect(thinByStretch(points).map((p) => p.id)).toEqual(["b", "c", "d", "h", "e"]);
  });

  it("counts per kind and per 50 km", () => {
    const s = summariseSafety([point("h1", "hospital", 10), point("h2", "hospital", 60)], 100);
    expect(s.counts.hospital).toBe(2);
    expect(s.counts.police).toBe(0);
    expect(s.perFiftyKm.hospital).toBe(1);
    expect(s.longestGap.hospital.km).toBe(50);
    expect(s.longestGap.police.km).toBe(100);
  });

  it("makes tap-to-call links from mapped numbers", () => {
    expect(telLink("+91 8173 244 444")).toBe("tel:+918173244444");
    expect(telLink("108")).toBe("tel:108");
    expect(telLink("n/a")).toBeNull();
  });
});

vi.mock("@/server/services/servicePointService", () => ({ servicesAlong: vi.fn() }));
vi.mock("@/server/services/routeService", () => ({ getRouteGeometry: vi.fn() }));

describe("POST /api/services/along", () => {
  const line = {
    type: "LineString" as const,
    coordinates: [
      [75, 13],
      [75, 13.9],
    ] as [number, number][],
  };
  beforeEach(() => vi.resetModules());

  it("summarises the stops near the route and 404s an expired route id", async () => {
    const { servicesAlong } = await import("@/server/services/servicePointService");
    const { getRouteGeometry } = await import("@/server/services/routeService");
    const { POST } = await import("@/app/api/services/along/route");
    vi.mocked(servicesAlong).mockResolvedValue([
      {
        osmId: "node/1",
        kind: "hospital",
        name: "CGH",
        phone: "108",
        location: [75, 13.1],
        kmFromStart: 11.12,
        detourM: 340,
      },
    ]);
    const post = (body: unknown) =>
      POST(
        new Request("http://x/api/services/along", { method: "POST", body: JSON.stringify(body) }),
      );
    const res = await post({ geometry: line });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { counts: Record<string, number>; points: SafetyPoint[] };
    expect(data.counts.hospital).toBe(1);
    expect(data.points[0]).toMatchObject({ id: "node/1", kmFromStart: 11.1, detourKm: 0.3 });
    expect(servicesAlong).toHaveBeenCalledWith(line, 3000, [
      "hospital",
      "police",
      "atm",
      "tyre",
      "repair",
    ]);

    vi.mocked(getRouteGeometry).mockResolvedValue(null);
    expect((await post({ routeId: `${"c".repeat(32)}-0` })).status).toBe(404);
    expect((await post({})).status).toBe(400);
  });
});
