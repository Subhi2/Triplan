import type { LineString } from "geojson";
import { describe, expect, it, vi } from "vitest";
import {
  ascentDescent,
  buildProfile,
  climbAt,
  cleanHeights,
  elevationAt,
  findClimbs,
  lttb,
  PROFILE_POINTS,
} from "@/lib/elevation";
import type { LngLat } from "@/lib/geo";
import type { JsonCache } from "@/server/db/cache";
import type { ElevationProvider } from "@/server/providers/elevation";
import { profileSamples, routeProfile } from "@/server/services/elevationService";

/** km every 100 m up to `km`. */
const kms = (km: number) => Array.from({ length: km * 10 + 1 }, (_, i) => i / 10);

/** A road: flat at 100 m for 10 km, climbs 900 m in 18 km, flat for 10 km, back down in 9 km. */
function ghatRoad(): { km: number[]; h: number[] } {
  const km = kms(47);
  const h = km.map((k) => {
    if (k < 10) return 100;
    if (k < 28) return 100 + ((k - 10) / 18) * 900;
    if (k < 38) return 1000;
    return 1000 - ((k - 38) / 9) * 900;
  });
  return { km, h };
}

describe("cleanHeights", () => {
  it("fills missing heights along a straight line between their neighbours", () => {
    // A steady 10 m rise per sample, with gaps: a straight line survives the smoothing.
    const raw = [100, 110, null, null, 140, 150, null, 170, 180, 190, 200];
    const clean = cleanHeights(raw)!;
    for (let i = 3; i <= 7; i++) expect(clean[i]).toBeCloseTo(100 + i * 10, 6); // away from the ends
    expect(cleanHeights([null, null])).toBeNull();
  });

  it("drops a one-sample spike, as a bridge over a valley gives", () => {
    const h = cleanHeights([500, 500, 500, 500, 420, 500, 500, 500, 500])!;
    expect(Math.min(...h)).toBeGreaterThan(495);
  });

  it("flattens the hill above a tunnel, which a road cannot climb", () => {
    // Flat road at 600 m; the tiles show a 300 m hill over a 1.2 km tunnel.
    const raw = kms(10).map((k) => (k > 4 && k < 5.2 ? 900 : 600));
    const h = cleanHeights(raw)!;
    expect(Math.max(...h)).toBeLessThan(680); // at most 12% up from each portal
  });

  it("keeps a real climb", () => {
    const { h } = ghatRoad();
    const clean = cleanHeights(h)!;
    expect(Math.max(...clean)).toBeCloseTo(1000, -1);
  });
});

describe("ascentDescent", () => {
  it("ignores small wiggles on a flat road", () => {
    const h = kms(100).map((_, i) => 500 + (i % 2 === 0 ? 4 : -4));
    expect(ascentDescent(h).ascentM).toBeLessThan(20);
  });

  it("adds up the climbs and descents", () => {
    const { h } = ghatRoad();
    expect(ascentDescent(h)).toEqual({ ascentM: 900, descentM: 900 });
  });
});

describe("findClimbs", () => {
  it("finds a 900 m climb in 18 km and the descent after it", () => {
    const { km, h } = ghatRoad();
    const climbs = findClimbs(km, h, (k) => (k > 25 && k < 30 ? "Top Town" : null));
    expect(climbs).toHaveLength(2);
    expect(climbs[0]).toMatchObject({
      dir: "up",
      fromKm: 10,
      toKm: 28,
      gainM: 900,
      near: "Top Town",
    });
    expect(climbs[0]!.gradePct).toBe(5);
    expect(climbs[1]).toMatchObject({ dir: "down", fromKm: 38, toKm: 47, gainM: 900 });
    expect(climbs[1]!.gradePct).toBe(10);
  });

  it("leaves out a small hill and a long gentle rise", () => {
    const km = kms(60);
    const hill = km.map((k) => (k > 5 && k < 7 ? 100 + 75 * (1 - Math.abs(k - 6)) : 100));
    expect(findClimbs(km, hill)).toEqual([]);
    const gentle = km.map((k) => 100 + k * 10); // 600 m at 1%
    expect(findClimbs(km, gentle)).toEqual([]);
  });

  it("carries a climb over a short flat bend", () => {
    const km = kms(30);
    const h = km.map((k) => {
      if (k < 5) return 100;
      if (k < 12) return 100 + (k - 5) * 50; // 350 m
      if (k < 12.6) return 450; // a 600 m flat
      if (k < 19.6) return 450 + (k - 12.6) * 50; // 350 m more
      return 800;
    });
    const climbs = findClimbs(km, h);
    expect(climbs).toHaveLength(1);
    expect(climbs[0]!.gainM).toBe(700);
  });
});

describe("lttb", () => {
  it("keeps the ends and the peak with far fewer points", () => {
    const { km, h } = ghatRoad();
    const pts = km.map((k, i): [number, number] => [k, h[i]!]);
    const out = lttb(pts, 60);
    expect(out).toHaveLength(60);
    expect(out[0]).toEqual(pts[0]);
    expect(out.at(-1)).toEqual(pts.at(-1));
    expect(Math.max(...out.map((p) => p[1]))).toBe(1000);
  });

  it("returns short series as they are", () => {
    const pts: [number, number][] = [
      [0, 1],
      [1, 2],
    ];
    expect(lttb(pts, 300)).toBe(pts);
  });
});

describe("buildProfile", () => {
  it("summarises a road and answers height and climb at a km", () => {
    const { km, h } = ghatRoad();
    const p = buildProfile(km, h, 12);
    expect(p.points.length).toBeLessThanOrEqual(PROFILE_POINTS);
    expect(p.highest).toMatchObject({ m: 1000 });
    expect(p.lowest.m).toBe(100);
    expect(p.ascentM).toBe(900);
    expect(elevationAt(p, 19)).toBeCloseTo(550, -1);
    expect(climbAt(p, 20)?.dir).toBe("up");
    expect(climbAt(p, 33)).toBeNull();
  });
});

describe("routeProfile", () => {
  const M_PER_DEG_LAT = 111_195;
  // A road 30 km north from 12°N; height rises 40 m per km (4%).
  const road: LineString = {
    type: "LineString",
    coordinates: [
      [76, 12],
      [76, 12 + 30_000 / M_PER_DEG_LAT],
    ],
  };
  const heightAt = ([, lat]: LngLat) => 100 + ((lat - 12) * M_PER_DEG_LAT * 40) / 1000;

  function memoryCache(): JsonCache & { store: Map<string, unknown> } {
    const store = new Map<string, unknown>();
    return {
      store,
      get: async (k) => store.get(k),
      set: async (k, v) => void store.set(k, v),
    };
  }

  it("samples every 100 m and ends on the last point", () => {
    const { points, km } = profileSamples(road);
    expect(points).toHaveLength(301);
    expect(km.at(-1)).toBeCloseTo(30, 2);
  });

  it("reads heights, names the climb after a nearby town and caches by route id", async () => {
    const elevation: ElevationProvider = {
      heights: vi.fn(async (pts: LngLat[]) => pts.map(heightAt)),
    };
    const cache = memoryCache();
    const deps = {
      elevation,
      cache,
      townsAlong: vi.fn(async () => [
        {
          name: "Top Town",
          kmFromStart: 29,
          population: 5000,
          kind: "town" as const,
          location: [0, 0] as LngLat,
        },
      ]),
    };
    const profile = await routeProfile(road, "abc-0", deps);
    expect(profile!.zoom).toBe(12);
    expect(profile!.ascentM).toBeGreaterThan(1150);
    expect(profile!.climbs[0]).toMatchObject({ dir: "up", near: "Top Town" });
    expect(cache.store.has("elev:v1:abc-0")).toBe(true);

    await routeProfile(road, "abc-0", deps);
    expect(elevation.heights).toHaveBeenCalledTimes(1);
  });

  it("gives no profile when too many heights are missing", async () => {
    const elevation: ElevationProvider = {
      heights: async (pts) => pts.map((p, i) => (i % 4 === 0 ? null : heightAt(p))),
    };
    const deps = { elevation, cache: memoryCache(), townsAlong: async () => [] };
    expect(await routeProfile(road, null, deps)).toBeNull();
  });
});
