import type { LineString } from "geojson";
import { describe, expect, it, vi } from "vitest";
import type { JsonCache } from "@/server/db/cache";
import type { TownNearLineRow } from "@/server/services/corridorService";
import { createRouteTowns, WIDEST_TOWN_M } from "@/server/services/routeTowns";

const LINE: LineString = {
  type: "LineString",
  coordinates: [
    [77.5946, 12.9716],
    [75.785, 12.943],
  ],
};

const town = (name: string, kmFromStart: number, distanceM: number): TownNearLineRow => ({
  name,
  location: [76, 13],
  kmFromStart,
  population: 10_000,
  kind: "town",
  distanceM,
});

const ROWS = [town("Near", 10, 500), town("Mid", 60, 2_500), town("Far", 120, 4_800)];

function mapCache(): JsonCache {
  const m = new Map<string, unknown>();
  return { get: async (k) => m.get(k), set: async (k, v) => void m.set(k, v) };
}

describe("townsAlong (one lookup per route)", () => {
  it("queries once at the widest radius and filters the others", async () => {
    const query = vi.fn(async () => ROWS);
    const townsAlong = createRouteTowns({ query, cache: mapCache() });

    const [two, three, five] = await Promise.all([
      townsAlong(LINE, 2_000),
      townsAlong(LINE, 3_000),
      townsAlong(LINE, WIDEST_TOWN_M),
    ]);

    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(LINE, WIDEST_TOWN_M);
    expect(two.map((t) => t.name)).toEqual(["Near"]);
    expect(three.map((t) => t.name)).toEqual(["Near", "Mid"]);
    expect(five.map((t) => t.name)).toEqual(["Near", "Mid", "Far"]);
    expect(five[0]).not.toHaveProperty("distanceM");
  });

  it("reads the shared cache before querying", async () => {
    const cache = mapCache();
    const first = createRouteTowns({ query: vi.fn(async () => ROWS), cache });
    await first(LINE, 2_000);

    const query = vi.fn(async () => [] as TownNearLineRow[]);
    const second = createRouteTowns({ query, cache }); // another server instance
    expect((await second(LINE, 3_000)).map((t) => t.name)).toEqual(["Near", "Mid"]);
    expect(query).not.toHaveBeenCalled();
  });

  it("queries directly for a radius wider than any caller's", async () => {
    const query = vi.fn(async () => ROWS);
    const townsAlong = createRouteTowns({ query, cache: mapCache() });
    await townsAlong(LINE, WIDEST_TOWN_M * 2);
    expect(query).toHaveBeenCalledWith(LINE, WIDEST_TOWN_M * 2);
  });

  it("tries again after a failed lookup", async () => {
    const query = vi
      .fn<() => Promise<TownNearLineRow[]>>()
      .mockRejectedValueOnce(new Error("db down"))
      .mockResolvedValueOnce(ROWS);
    const townsAlong = createRouteTowns({ query, cache: mapCache() });
    await expect(townsAlong(LINE, 2_000)).rejects.toThrow("db down");
    expect((await townsAlong(LINE, 2_000)).map((t) => t.name)).toEqual(["Near"]);
  });
});
