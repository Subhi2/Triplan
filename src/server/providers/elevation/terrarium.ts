import { convertIndexedToRgb, decode } from "fast-png";
import type { LngLat } from "@/lib/geo";
import { decodeTerrarium, tileFraction, tileUrl } from "@/lib/terrain";
import { fetchBytes, ProviderError } from "../http";
import type { ElevationProvider, HeightTile } from "./types";

// Reads heights from Terrarium PNG tiles (AWS Terrain Tiles by default). Tiles are fetched a few
// at a time and the decoded ones kept in memory, so the three route options of a search (which
// share most tiles) fetch each tile once on a warm server.

const CONCURRENCY = 6;
const TIMEOUT_MS = 8_000;
const MAX_TILE_BYTES = 1_000_000;
/** Decoded tiles kept in memory: 64 × 256 × 256 × 4 bytes = 16 MB. */
const CACHE_TILES = 64;

/** Decodes a Terrarium PNG into heights. Throws on anything that is not a square 8-bit tile. */
export function decodeTerrariumPng(bytes: Uint8Array): HeightTile {
  const png = decode(bytes);
  if (png.width !== png.height || png.depth !== 8) {
    throw new ProviderError(`Unexpected terrain tile ${png.width}×${png.height}`, "terrain");
  }
  let data = png.data;
  let channels = png.channels;
  if (png.palette) {
    data = convertIndexedToRgb(png);
    channels = png.palette[0]?.length ?? 3;
  }
  if (channels < 3) throw new ProviderError("Terrain tile is not RGB", "terrain");
  const size = png.width;
  const heights = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) {
    const o = i * channels;
    heights[i] = decodeTerrarium(data[o]!, data[o + 1]!, data[o + 2]!);
  }
  return { size, heights };
}

/** Height at fractional pixel position (px, py) of a tile, bilinear between pixel centres. */
export function sampleTile(tile: HeightTile, px: number, py: number): number {
  const { size, heights } = tile;
  const fx = Math.max(0, Math.min(size - 1, px - 0.5));
  const fy = Math.max(0, Math.min(size - 1, py - 0.5));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(size - 1, x0 + 1);
  const y1 = Math.min(size - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;
  const at = (x: number, y: number) => heights[y * size + x]!;
  const top = at(x0, y0) * (1 - tx) + at(x1, y0) * tx;
  const bottom = at(x0, y1) * (1 - tx) + at(x1, y1) * tx;
  return top * (1 - ty) + bottom * ty;
}

export type TileFetcher = (url: string) => Promise<Uint8Array>;

export function createTerrariumProvider(
  template: string,
  userAgent: string,
  fetchTile: TileFetcher = (url) =>
    fetchBytes(
      "terrain",
      url,
      { headers: { "User-Agent": userAgent } },
      TIMEOUT_MS,
      MAX_TILE_BYTES,
    ),
): ElevationProvider {
  const cache = new Map<string, HeightTile>();

  async function load(key: string): Promise<HeightTile | null> {
    const hit = cache.get(key);
    if (hit) {
      cache.delete(key); // move to the end: most recently used
      cache.set(key, hit);
      return hit;
    }
    const [z, x, y] = key.split("/").map(Number) as [number, number, number];
    try {
      const tile = decodeTerrariumPng(await fetchTile(tileUrl(template, z, x, y)));
      cache.set(key, tile);
      if (cache.size > CACHE_TILES) cache.delete(cache.keys().next().value!);
      return tile;
    } catch (err) {
      console.warn(`Terrain tile ${key} failed`, err);
      return null;
    }
  }

  return {
    async heights(points: LngLat[], zoom: number) {
      const where = points.map((p) => {
        const { x, y } = tileFraction(p, zoom);
        const tx = Math.floor(x);
        const ty = Math.floor(y);
        return { key: `${zoom}/${tx}/${ty}`, px: (x - tx) * 256, py: (y - ty) * 256 };
      });

      const keys = [...new Set(where.map((w) => w.key))];
      const tiles = new Map<string, HeightTile | null>();
      for (let i = 0; i < keys.length; i += CONCURRENCY) {
        const batch = keys.slice(i, i + CONCURRENCY);
        const loaded = await Promise.all(batch.map(load));
        batch.forEach((k, j) => tiles.set(k, loaded[j]!));
      }

      return where.map(({ key, px, py }) => {
        const tile = tiles.get(key);
        if (!tile) return null;
        const scale = tile.size / 256; // 512 px tiles from another server
        return sampleTile(tile, px * scale, py * scale);
      });
    },
  };
}
