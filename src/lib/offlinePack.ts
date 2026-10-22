import { haversineM, type LngLat } from "./geo";

// Offline trip pack (docs/02, "Offline trip pack"): the corridor's map tiles from our own
// PMTiles file, never a public tile server ("Choosing new features" in CLAUDE.md), plus the
// trip's route and places, saved on the phone. Pure: which tiles, and where they are kept.

/** Tiles at most per pack, and bytes: a phone's storage and our own file's bandwidth. */
export const PACK_MAX_TILES = 3000;
export const PACK_MAX_BYTES = 50 * 1024 * 1024;
/** Tiles fetched at a time. */
export const PACK_CONCURRENCY = 4;
/** Zooms kept: 6 shows the region, 13 the villages and roads. */
export const PACK_MIN_ZOOM = 6;
export const PACK_MAX_ZOOM = 13;
/** The lowest top zoom before a route is too long for one pack. */
export const PACK_LOWEST_TOP_ZOOM = 11;
/** Tiles either side of the road. */
export const PACK_CORRIDOR_KM = 5;

/** Cache Storage name for a route's pack. */
export const packCacheName = (routeId: string) => `pack-${routeId}`;
/** The key a tile is kept under in the pack's cache (never fetched from the network). */
export const packTileKey = (z: number, x: number, y: number) => `/offline-tiles/${z}/${x}/${y}`;
export const packGlyphKey = (fontstack: string, range: string) =>
  `/offline-glyphs/${encodeURIComponent(fontstack)}/${range}.pbf`;

export interface Tile {
  z: number;
  x: number;
  y: number;
}

function lngToX(lng: number, z: number): number {
  return Math.floor(((lng + 180) / 360) * 2 ** z);
}

function latToY(lat: number, z: number): number {
  const r = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
}

/** Points along the line no more than `stepM` apart. */
function samples(line: LngLat[], stepM: number): LngLat[] {
  const out: LngLat[] = line.length > 0 ? [line[0]!] : [];
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!;
    const b = line[i]!;
    const n = Math.ceil(haversineM(a, b) / stepM);
    for (let k = 1; k <= n; k++) {
      out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
    }
  }
  return out;
}

/** Every tile at zoom `z` within `bufferKm` of the line. */
export function corridorTiles(line: LngLat[], z: number, bufferKm = PACK_CORRIDOR_KM): Tile[] {
  const seen = new Set<string>();
  const tiles: Tile[] = [];
  for (const [lng, lat] of samples(line, (bufferKm * 1000) / 2)) {
    const dLat = bufferKm / 111.32;
    const dLng = bufferKm / (111.32 * Math.cos((lat * Math.PI) / 180));
    const x0 = lngToX(lng - dLng, z);
    const x1 = lngToX(lng + dLng, z);
    const y0 = latToY(lat + dLat, z);
    const y1 = latToY(lat - dLat, z);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const key = `${x}/${y}`;
        if (!seen.has(key)) {
          seen.add(key);
          tiles.push({ z, x, y });
        }
      }
    }
  }
  return tiles;
}

export interface PackPlan {
  tiles: Tile[];
  /** The top zoom kept: 13, or 12 or 11 for a long route. */
  maxZoom: number;
}

/**
 * The tiles for a route's pack, zoom 6 to 13. A route that would need more than 3,000 tiles drops
 * its top zoom to 12, then 11; null when even that is too many (a pack per day is the answer).
 */
export function planPack(line: LngLat[]): PackPlan | null {
  for (let top = PACK_MAX_ZOOM; top >= PACK_LOWEST_TOP_ZOOM; top--) {
    const tiles: Tile[] = [];
    for (let z = PACK_MIN_ZOOM; z <= top; z++) {
      tiles.push(...corridorTiles(line, z));
      if (tiles.length > PACK_MAX_TILES) break;
    }
    if (tiles.length <= PACK_MAX_TILES) return { tiles, maxZoom: top };
  }
  return null;
}

/** The fonts the offline style uses, and the glyph ranges kept (Latin, punctuation, Indic). */
export const PACK_FONTSTACKS = ["Noto Sans Regular", "Noto Sans Medium", "Noto Sans Italic"];
export const PACK_GLYPH_RANGES = ["0-255", "256-511", "8192-8447"];
