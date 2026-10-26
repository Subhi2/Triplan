import { describe, expect, it } from "vitest";
import type { LngLat } from "@/lib/geo";
import {
  corridorTiles,
  PACK_MAX_TILES,
  packCacheName,
  packGlyphKey,
  packTileKey,
  planPack,
} from "@/lib/offlinePack";

// A straight line east along 13° N, `km` long (0.00923° of longitude is about 1 km there).
const east = (km: number): LngLat[] => [
  [75, 13],
  [75 + km * 0.00923, 13],
];

describe("corridorTiles", () => {
  it("covers the road and 5 km either side", () => {
    // Zoom 13 tiles are about 4.8 km wide at 13° N: a 10 km wide band is 3 or 4 tiles deep.
    const tiles = corridorTiles(east(20), 13);
    const ys = new Set(tiles.map((t) => t.y));
    expect(ys.size).toBeGreaterThanOrEqual(3);
    expect(ys.size).toBeLessThanOrEqual(4);
    const xs = new Set(tiles.map((t) => t.x));
    expect(xs.size).toBeGreaterThanOrEqual(6); // 30 km of road plus buffer, in 4.8 km tiles
    // No tile twice.
    expect(new Set(tiles.map((t) => `${t.x}/${t.y}`)).size).toBe(tiles.length);
  });

  it("needs one tile for a short road at a low zoom", () => {
    expect(corridorTiles(east(1), 6)).toHaveLength(1);
  });
});

describe("planPack", () => {
  it("keeps zoom 6 to 13 for a day's ride, well under 3,000 tiles", () => {
    const plan = planPack(east(330))!;
    expect(plan.maxZoom).toBe(13);
    expect(Math.min(...plan.tiles.map((t) => t.z))).toBe(6);
    expect(plan.tiles.length).toBeLessThan(1000);
  });

  it("lowers the top zoom for a long route, and gives up on one that sweeps a huge area", () => {
    // 4,000 km needs more than 3,000 tiles up to zoom 13, so it stops at 12.
    const long = planPack(east(4000))!;
    expect(long.maxZoom).toBe(12);
    expect(long.tiles.length).toBeLessThanOrEqual(PACK_MAX_TILES);
    // Back and forth across 10° by 9°: too many tiles even up to zoom 11.
    const sweep: LngLat[] = [];
    for (let row = 0; row <= 60; row++) {
      const lat = 10 + row * 0.15;
      sweep.push(row % 2 === 0 ? [72, lat] : [82, lat], row % 2 === 0 ? [82, lat] : [72, lat]);
    }
    expect(planPack(sweep)).toBeNull();
  });
});

describe("pack keys", () => {
  it("names a pack's cache and the keys of its tiles and glyphs", () => {
    expect(packCacheName("abc-0")).toBe("pack-abc-0");
    expect(packTileKey(13, 5800, 3770)).toBe("/offline-tiles/13/5800/3770");
    expect(packGlyphKey("Noto Sans Regular", "0-255")).toBe(
      "/offline-glyphs/Noto%20Sans%20Regular/0-255.pbf",
    );
  });
});
