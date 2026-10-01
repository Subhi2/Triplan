import { encode } from "fast-png";
import { describe, expect, it, vi } from "vitest";
import {
  chooseZoom,
  decodeTerrarium,
  DEFAULT_TERRAIN_TILES_URL,
  tileFraction,
  tilesFor,
  tileUrl,
} from "@/lib/terrain";
import {
  createTerrariumProvider,
  decodeTerrariumPng,
  sampleTile,
} from "@/server/providers/elevation/terrarium";
import type { LngLat } from "@/lib/geo";

/** Terrarium RGB for a height: R·256 + G + B/256 − 32768. */
function rgb(m: number): [number, number, number] {
  const v = m + 32768;
  return [Math.floor(v / 256), Math.floor(v) % 256, Math.round((v % 1) * 256)];
}

/** A 256 px Terrarium tile whose height is `f(x, y)` at each pixel. */
function tilePng(f: (x: number, y: number) => number, channels = 3): Uint8Array {
  const data = new Uint8Array(256 * 256 * channels);
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const o = (y * 256 + x) * channels;
      data.set(rgb(f(x, y)), o);
      if (channels === 4) data[o + 3] = 255;
    }
  }
  return encode({ width: 256, height: 256, data, channels, depth: 8 });
}

describe("terrain tiles", () => {
  it("decodes Terrarium heights", () => {
    expect(decodeTerrarium(128, 0, 0)).toBe(0);
    expect(decodeTerrarium(...rgb(1234.5))).toBeCloseTo(1234.5, 2);
    expect(decodeTerrarium(...rgb(-50))).toBe(-50);
  });

  it("finds a point's tile in the Web Mercator grid", () => {
    expect(tileFraction([0, 0], 1)).toEqual({ x: 1, y: 1 });
    const { x, y } = tileFraction([75.785, 12.943], 12); // Sakleshpur
    expect(Math.floor(x)).toBe(2910);
    expect(Math.floor(y)).toBe(1899);
    expect(tileUrl(DEFAULT_TERRAIN_TILES_URL, 12, 2910, 1899)).toBe(
      "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/12/2910/1899.png",
    );
  });

  it("chooses a coarser zoom when a route needs too many tiles", () => {
    const line: LngLat[] = Array.from({ length: 300 }, (_, i) => [75 + i * 0.01, 13]);
    expect(tilesFor(line, 12).length).toBeGreaterThan(20);
    const z = chooseZoom(line, 12, 20);
    expect(z).toBeLessThan(12);
    expect(tilesFor(line, z).length).toBeLessThanOrEqual(20);
    expect(chooseZoom(line, 12, 1000)).toBe(12);
  });
});

describe("Terrarium provider", () => {
  it("decodes RGB and RGBA tiles", () => {
    expect(decodeTerrariumPng(tilePng(() => 900)).heights[0]).toBe(900);
    expect(decodeTerrariumPng(tilePng(() => 900, 4)).heights[255]).toBe(900);
  });

  it("interpolates between pixel centres", () => {
    const tile = decodeTerrariumPng(tilePng((x) => x * 10)); // 10 m per pixel eastwards
    expect(sampleTile(tile, 10.5, 3)).toBeCloseTo(100, 3); // a pixel centre
    expect(sampleTile(tile, 11, 3)).toBeCloseTo(105, 3); // halfway to the next
    expect(sampleTile(tile, 0, 3)).toBe(0); // clamped at the edge
  });

  it("reads heights for points, fetching each tile once and reusing it", async () => {
    const fetchTile = vi.fn(async () => tilePng((x, y) => 500 + x + y));
    const provider = createTerrariumProvider(DEFAULT_TERRAIN_TILES_URL, "test", fetchTile);
    const points: LngLat[] = [
      [75.785, 12.943],
      [75.7851, 12.9431],
    ];
    const first = await provider.heights(points, 12);
    expect(first.every((h) => h !== null && h > 500 && h < 1012)).toBe(true);
    await provider.heights(points, 12);
    expect(fetchTile).toHaveBeenCalledTimes(1);
    expect(fetchTile).toHaveBeenCalledWith(
      "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/12/2910/1899.png",
    );
  });

  it("gives null for points whose tile cannot be read", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetchTile = vi.fn(async (url: string) => {
      if (url.includes("/2910/")) throw new Error("HTTP 503");
      return tilePng(() => 100);
    });
    const provider = createTerrariumProvider(DEFAULT_TERRAIN_TILES_URL, "test", fetchTile);
    const heights = await provider.heights(
      [
        [75.785, 12.943], // tile x 2910
        [76.2, 12.943], // another tile
      ],
      12,
    );
    expect(heights).toEqual([null, 100]);
  });
});
