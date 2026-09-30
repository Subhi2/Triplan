import { describe, expect, it, vi } from "vitest";
import type { LngLat } from "@/lib/geo";
import { nearbyQuerySchema } from "@/lib/nearby";
import { ProviderError } from "@/server/providers/http";
import type { RoutingTableProvider, TableCell } from "@/server/providers/routing";
import { findNearby, type NearbyDeps, type PlaceNearRow } from "@/server/services/nearbyService";

vi.mock("@/server/db", () => ({ getDb: vi.fn() }));

const ORIGIN: LngLat = [75.785, 12.943];

function row(id: string, distanceKm: number, priority = 2): PlaceNearRow {
  return {
    id,
    slug: id,
    name: id,
    category: "fort",
    // Due north of the origin (1° of latitude ≈ 111 km).
    location: [ORIGIN[0], ORIGIN[1] + distanceKm / 111.2],
    distanceM: distanceKm * 1000,
    ratingAvg: null,
    ratingCount: 0,
    bestMonths: [],
    thumbUrl: null,
    trendingScore: 0,
    notable: true,
    priority,
  };
}

function deps(rows: PlaceNearRow[], cells: (d: LngLat[]) => (TableCell | null)[]) {
  const table: RoutingTableProvider = {
    table: vi.fn(async ({ destinations }) => cells(destinations)),
  };
  return { placesNear: vi.fn<NearbyDeps["placesNear"]>(async () => rows), table };
}

const query = (q: Record<string, string>) =>
  nearbyQuerySchema.parse({ lng: String(ORIGIN[0]), lat: String(ORIGIN[1]), ...q });

describe("findNearby", () => {
  it("keeps places within the time by road, nearest first", async () => {
    const rows = [row("a", 10), row("b", 30), row("c", 20), row("unreachable", 5)];
    // Road 1.3 × the straight line, at 36 km/h; "unreachable" has no road.
    const d = deps(rows, (dest) =>
      dest.map((loc) => {
        const r = rows.find((x) => x.location === loc)!;
        const km = r.distanceM / 1000;
        return r.id === "unreachable" ? null : { distanceM: km * 1300, durationS: km * 100 };
      }),
    );
    // 30 min = 1800 s: a takes 1000 s; c (2000 s) and b (3000 s) are too far.
    const res = await findNearby(query({ within: "30", vehicle: "car" }), d);
    expect(res.roadTimes).toBe("osrm");
    expect(res.places.map((p) => p.id)).toEqual(["a"]);
    expect(res.places[0]!.roadKm).toBeCloseTo(13);
    expect(res.places[0]!.rideMin).toBeCloseTo(1000 / 60);
    expect(res.places[0]!.bearingDeg).toBeCloseTo(0, 0);
  });

  it("sends at most 99 destinations and the vehicle's profile", async () => {
    const rows = Array.from({ length: 300 }, (_, i) => row(`p${i}`, (i % 50) + 1));
    const d = deps(rows, (dest) => dest.map(() => ({ distanceM: 1000, durationS: 60 })));
    await findNearby(query({ within: "60", vehicle: "bike" }), d);
    const input = vi.mocked(d.table.table).mock.calls[0]![0];
    expect(input.destinations).toHaveLength(99);
    expect(input.profile).toBe("bike");
    expect(input.origin).toEqual(ORIGIN);
  });

  it("falls back to straight-line distance when OSRM fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const rows = [row("near", 10), row("far", 50), row("mid", 20)];
    const d = deps(rows, () => {
      throw new ProviderError("osrm request failed", "osrm");
    });
    const res = await findNearby(query({ within: "60", vehicle: "car" }), d);
    expect(res.roadTimes).toBe("straight");
    // 35 km straight line in 1 h.
    expect(res.places.map((p) => p.id)).toEqual(["near", "mid"]);
    expect(res.places.every((p) => p.rideMin === null && p.roadKm === null)).toBe(true);
    expect(JSON.stringify(warn.mock.calls)).not.toContain("75.785");
    warn.mockRestore();
  });

  it("sends places in season this month for road times first", async () => {
    // 150 equal places; only p149 is at its best in October.
    const rows = Array.from({ length: 150 }, (_, i) => ({
      ...row(`p${i}`, 10),
      bestMonths: i === 149 ? [10] : [],
    }));
    const d = { ...deps(rows, (dest) => dest.map(() => null)), month: 10 };
    await findNearby(query({ within: "60", vehicle: "car" }), d);
    const sent = vi.mocked(d.table.table).mock.calls[0]![0].destinations;
    expect(sent[0]).toEqual(rows[149]!.location);
  });

  it("never asks OSRM in ride mode", async () => {
    const d = deps([row("a", 10)], () => []);
    const res = await findNearby(query({ mode: "ride" }), d);
    expect(d.table.table).not.toHaveBeenCalled();
    expect(res.places).toHaveLength(1);
    expect(d.placesNear).toHaveBeenCalledWith(ORIGIN, 35_000, expect.any(Array), 400);
  });

  it("leaves fuel stations and towns out by default", async () => {
    const d = deps([], () => []);
    await findNearby(query({}), d);
    const categories = vi.mocked(d.placesNear).mock.calls[0]![2]!;
    expect(categories).toContain("fort");
    expect(categories).not.toContain("fuel");
    expect(categories).not.toContain("town");
  });
});
