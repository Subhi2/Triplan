import type { LngLat } from "@/lib/geo";
import type { BBox } from "../providers/osm";

export interface OsmRegion {
  name: string; // stored in place.state
  iso: string; // ISO3166-2 tag of the state boundary relation in OSM
  bbox: BBox; // bounds of that boundary relation; tiles outside the boundary return nothing
  /**
   * Tile size in degrees. 1° where OSM is dense (big cities), 2° for large, sparsely mapped
   * states, one query for small or scattered territories. Tiles that are too big are split.
   */
  tileDeg?: number;
}

/**
 * Every Indian state and union territory. The first five follow the build plan; the rest go south
 * to north to east. Bounds and ISO codes are from the OSM boundary relations (admin_level 4), which
 * use the 2023 ISO codes (IN-OD, IN-TS, IN-CG, IN-UK).
 */
export const OSM_REGIONS = {
  karnataka: { name: "Karnataka", iso: "IN-KA", bbox: [74.05, 11.59, 78.59, 18.48] },
  kerala: { name: "Kerala", iso: "IN-KL", bbox: [74.86, 8.29, 77.41, 12.8] },
  "tamil-nadu": { name: "Tamil Nadu", iso: "IN-TN", bbox: [76.23, 8.08, 80.36, 13.56] },
  goa: { name: "Goa", iso: "IN-GA", bbox: [73.68, 14.75, 74.34, 15.8] },
  maharashtra: { name: "Maharashtra", iso: "IN-MH", bbox: [72.65, 15.61, 80.9, 22.03] },
  "andhra-pradesh": { name: "Andhra Pradesh", iso: "IN-AP", bbox: [76.76, 12.62, 84.77, 19.17] },
  telangana: { name: "Telangana", iso: "IN-TS", bbox: [77.24, 15.84, 81.32, 19.92] },
  puducherry: { name: "Puducherry", iso: "IN-PY", bbox: [75.53, 10.83, 82.31, 16.76], tileDeg: 8 },
  gujarat: { name: "Gujarat", iso: "IN-GJ", bbox: [68.18, 20.12, 74.48, 24.71] },
  rajasthan: { name: "Rajasthan", iso: "IN-RJ", bbox: [69.48, 23.06, 78.27, 30.2], tileDeg: 2 },
  "madhya-pradesh": {
    name: "Madhya Pradesh",
    iso: "IN-MP",
    bbox: [74.03, 21.07, 82.81, 26.87],
    tileDeg: 2,
  },
  "himachal-pradesh": {
    name: "Himachal Pradesh",
    iso: "IN-HP",
    bbox: [75.59, 30.38, 79.01, 33.26],
    tileDeg: 2,
  },
  uttarakhand: {
    name: "Uttarakhand",
    iso: "IN-UK",
    bbox: [77.57, 28.72, 81.04, 31.46],
    tileDeg: 2,
  },
  "jammu-and-kashmir": {
    name: "Jammu and Kashmir",
    iso: "IN-JK",
    bbox: [73.75, 32.28, 76.78, 34.79],
    tileDeg: 2,
  },
  ladakh: { name: "Ladakh", iso: "IN-LA", bbox: [75.33, 32.34, 79.46, 35.67], tileDeg: 2 },
  punjab: { name: "Punjab", iso: "IN-PB", bbox: [73.88, 29.54, 76.94, 32.51] },
  haryana: { name: "Haryana", iso: "IN-HR", bbox: [74.47, 27.65, 77.6, 30.93] },
  delhi: { name: "Delhi", iso: "IN-DL", bbox: [76.84, 28.4, 77.35, 28.88] },
  chandigarh: { name: "Chandigarh", iso: "IN-CH", bbox: [76.7, 30.66, 76.85, 30.79] },
  "uttar-pradesh": { name: "Uttar Pradesh", iso: "IN-UP", bbox: [77.08, 23.87, 84.63, 30.41] },
  bihar: { name: "Bihar", iso: "IN-BR", bbox: [83.32, 24.29, 88.29, 27.52] },
  jharkhand: { name: "Jharkhand", iso: "IN-JH", bbox: [83.33, 21.97, 87.96, 25.35], tileDeg: 2 },
  chhattisgarh: {
    name: "Chhattisgarh",
    iso: "IN-CG",
    bbox: [80.24, 17.78, 84.4, 24.11],
    tileDeg: 2,
  },
  odisha: { name: "Odisha", iso: "IN-OD", bbox: [81.39, 17.81, 87.49, 22.57], tileDeg: 2 },
  "west-bengal": { name: "West Bengal", iso: "IN-WB", bbox: [85.82, 21.55, 89.88, 27.22] },
  sikkim: { name: "Sikkim", iso: "IN-SK", bbox: [88.01, 27.08, 88.92, 28.12] },
  assam: { name: "Assam", iso: "IN-AS", bbox: [89.7, 24.14, 96.01, 27.97], tileDeg: 2 },
  meghalaya: { name: "Meghalaya", iso: "IN-ML", bbox: [89.81, 25.03, 92.8, 26.12], tileDeg: 2 },
  "arunachal-pradesh": {
    name: "Arunachal Pradesh",
    iso: "IN-AR",
    bbox: [91.56, 26.65, 97.4, 29.37],
    tileDeg: 2,
  },
  nagaland: { name: "Nagaland", iso: "IN-NL", bbox: [93.33, 25.2, 95.24, 27.04], tileDeg: 2 },
  manipur: { name: "Manipur", iso: "IN-MN", bbox: [92.97, 23.83, 94.75, 25.69], tileDeg: 2 },
  mizoram: { name: "Mizoram", iso: "IN-MZ", bbox: [92.26, 21.94, 93.44, 24.52], tileDeg: 2 },
  tripura: { name: "Tripura", iso: "IN-TR", bbox: [91.15, 22.94, 92.34, 24.53], tileDeg: 2 },
  "andaman-and-nicobar": {
    name: "Andaman and Nicobar Islands",
    iso: "IN-AN",
    bbox: [92.2, 6.76, 94.28, 13.68],
    tileDeg: 8,
  },
  lakshadweep: { name: "Lakshadweep", iso: "IN-LD", bbox: [71.52, 8.06, 73.91, 12.6], tileDeg: 8 },
  "dadra-nagar-haveli-daman-diu": {
    name: "Dadra and Nagar Haveli and Daman and Diu",
    iso: "IN-DH",
    bbox: [70.87, 20.05, 73.22, 20.77],
    tileDeg: 3,
  },
} as const satisfies Record<string, OsmRegion>;

export type OsmRegionKey = keyof typeof OSM_REGIONS;

export function isOsmRegionKey(key: string): key is OsmRegionKey {
  return Object.hasOwn(OSM_REGIONS, key);
}

/**
 * Region keys from a list ("all", or keys like "kerala,goa"), minus `skip`. Commas or spaces
 * separate keys (PowerShell turns unquoted "a,b" into "a b").
 * Returns the unknown keys instead when there are any.
 */
export function resolveRegionKeys(
  list: string,
  skip = "",
): { keys: OsmRegionKey[]; unknown: string[] } {
  const split = (s: string) =>
    s
      .split(/[\s,]+/)
      .map((k) => k.trim())
      .filter(Boolean);
  const requested = split(list).flatMap((k) =>
    k === "all" ? (Object.keys(OSM_REGIONS) as string[]) : [k],
  );
  const skipped = split(skip);
  const unknown = [...requested, ...skipped].filter((k) => !isOsmRegionKey(k));
  const keys = [...new Set(requested)].filter(
    (k): k is OsmRegionKey => isOsmRegionKey(k) && !skipped.includes(k),
  );
  return { keys, unknown };
}

const round = (n: number) => Math.round(n * 1e6) / 1e6;

/** Grows a bounding box by `deg` on every side (the region bounds are rounded to 0.01°). */
export function padBBox([west, south, east, north]: BBox, deg: number): BBox {
  return [round(west - deg), round(south - deg), round(east + deg), round(north + deg)];
}

/** Splits a bounding box into a grid of tiles of at most `sizeDeg` degrees. */
export function tilesFor([west, south, east, north]: BBox, sizeDeg: number): BBox[] {
  const tiles: BBox[] = [];
  for (let lat = south; lat < north - 1e-9; lat += sizeDeg) {
    for (let lng = west; lng < east - 1e-9; lng += sizeDeg) {
      tiles.push([
        round(lng),
        round(lat),
        round(Math.min(lng + sizeDeg, east)),
        round(Math.min(lat + sizeDeg, north)),
      ]);
    }
  }
  return tiles;
}

/** Quarters a tile, for queries that were too big. */
export function splitTile([west, south, east, north]: BBox): BBox[] {
  const midLng = round((west + east) / 2);
  const midLat = round((south + north) / 2);
  return [
    [west, south, midLng, midLat],
    [midLng, south, east, midLat],
    [west, midLat, midLng, north],
    [midLng, midLat, east, north],
  ];
}

export function tileSizeDeg([west, , east]: BBox): number {
  return east - west;
}

/**
 * Whether a tile, grown by `marginDeg` on every side, touches a state's outline (polygons of
 * rings, from Nominatim). Exact for a polygon and a rectangle: a ring point inside the tile, a
 * tile corner inside a ring, or a ring edge crossing a tile edge. The margin covers the outline's
 * simplification. Inner rings count as part of the state, so a tile is never skipped for one.
 */
export function tileTouchesOutline(tile: BBox, outline: LngLat[][][], marginDeg: number): boolean {
  const [w, s, e, n] = [
    tile[0] - marginDeg,
    tile[1] - marginDeg,
    tile[2] + marginDeg,
    tile[3] + marginDeg,
  ];
  const corners: LngLat[] = [
    [w, s],
    [e, s],
    [e, n],
    [w, n],
  ];
  const sides: [LngLat, LngLat][] = corners.map((c, i) => [c, corners[(i + 1) % 4]!]);
  for (const ring of outline.flat()) {
    if (ring.some(([x, y]) => x >= w && x <= e && y >= s && y <= n)) return true;
    if (corners.some((c) => insideRing(c, ring))) return true;
    for (let i = 0; i + 1 < ring.length; i++) {
      if (sides.some(([a, b]) => segmentsCross(a, b, ring[i]!, ring[i + 1]!))) return true;
    }
  }
  return false;
}

function insideRing([x, y]: LngLat, ring: LngLat[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function segmentsCross(a: LngLat, b: LngLat, c: LngLat, d: LngLat): boolean {
  const cross = (o: LngLat, p: LngLat, q: LngLat) =>
    (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return d1 * d2 <= 0 && d3 * d4 <= 0 && !(d1 === 0 && d2 === 0 && d3 === 0 && d4 === 0);
}

/**
 * Whether an outline is the state's own: its bounds lie within the state's box (from the same
 * OSM relation) give or take half a degree. Guards against Nominatim matching another place,
 * which would make the import skip tiles of the state.
 */
export function outlineFitsRegion(outline: LngLat[][][], bbox: BBox): boolean {
  const points = outline.flat(2);
  if (points.length === 0) return false;
  const [w, s, e, n] = padBBox(bbox, 0.5);
  return points.every(([x, y]) => x >= w && x <= e && y >= s && y <= n);
}
