import type { LngLat } from "./geo";

// Terrain heights from AWS Terrain Tiles (docs/02-architecture.md, "Elevation profile"): global
// PNG tiles in the Terrarium encoding, SRTM for India, open data with attribution and no key.
// Shared by the server (elevation profiles) and the browser (3D terrain in the ride preview), so
// both read the same tiles. Every use of terrain tiles goes through this module.

export const DEFAULT_TERRAIN_TILES_URL =
  "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";

/** Required credit wherever terrain tiles are used (map attribution, posters, videos). */
export const TERRAIN_ATTRIBUTION =
  "Terrain: AWS Terrain Tiles (Mapzen) · SRTM, GMTED2010 courtesy of USGS · ETOPO1 NOAA";
export const TERRAIN_CREDIT_SHORT = "Terrain © USGS, NOAA (AWS Terrain Tiles)";

export const TERRAIN_TILE_SIZE = 256;
/** Deepest zoom the tiles exist at. */
export const TERRAIN_MAX_ZOOM = 15;

/** The tile URL template, `{z}/{x}/{y}`. NEXT_PUBLIC_TERRAIN_TILES_URL overrides the default. */
export function terrainTilesUrl(): string {
  return process.env.NEXT_PUBLIC_TERRAIN_TILES_URL?.trim() || DEFAULT_TERRAIN_TILES_URL;
}

export function tileUrl(template: string, z: number, x: number, y: number): string {
  return template.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
}

/** Height in metres of a Terrarium pixel: R·256 + G + B/256 − 32768. */
export function decodeTerrarium(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768;
}

/** Where a point falls in the Web Mercator tile grid at zoom z, as fractional tile x and y. */
export function tileFraction([lng, lat]: LngLat, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const clampedLat = Math.max(-85.0511, Math.min(85.0511, lat));
  const latRad = (clampedLat * Math.PI) / 180;
  return {
    x: ((lng + 180) / 360) * n,
    y: ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n,
  };
}

/** "z/x/y" of the tile holding each point, deduplicated. */
export function tilesFor(points: LngLat[], z: number): string[] {
  const keys = new Set<string>();
  for (const p of points) {
    const { x, y } = tileFraction(p, z);
    keys.add(`${z}/${Math.floor(x)}/${Math.floor(y)}`);
  }
  return [...keys];
}

/**
 * The deepest zoom (from `maxZoom` down) at which the points need at most `maxTiles` tiles, so a
 * long route reads fewer, coarser tiles.
 */
export function chooseZoom(points: LngLat[], maxZoom: number, maxTiles: number): number {
  for (let z = maxZoom; z > 0; z--) {
    if (tilesFor(points, z).length <= maxTiles) return z;
  }
  return 1;
}
