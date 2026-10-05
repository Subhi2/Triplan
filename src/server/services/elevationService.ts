import type { LineString } from "geojson";
import {
  buildProfile,
  cleanHeights,
  PROFILE_SAMPLE_M,
  type ElevationProfile,
} from "@/lib/elevation";
import { haversineM, resampleLine, type LngLat } from "@/lib/geo";
import { chooseZoom } from "@/lib/terrain";
import { routeDbCache, type JsonCache } from "../db/cache";
import { getElevationProvider, type ElevationProvider } from "../providers/elevation";
import { hashKey } from "../providers/cacheKey";
import { townsAlongDb } from "./routeService";
import type { TownOnRoute } from "./viaLabel";

/** Tiles at z12 are about 37 m a pixel at Indian latitudes, close to SRTM's own resolution. */
const MAX_ZOOM = 12;
/** A 1,000 km route needs about 130 tiles at z12; longer ones drop to a coarser zoom. */
const MAX_TILES = 160;
/** More missing heights than this and the profile is not shown. */
const MAX_MISSING = 0.1;
/** A climb is named after a town at most this far (along the road) from its top. */
const TOWN_WITHIN_KM = 15;
const CACHE_PREFIX = "elev:v1:";

export interface ElevationDeps {
  elevation: ElevationProvider;
  townsAlong(geometry: LineString): Promise<TownOnRoute[]>;
  cache: JsonCache;
}

function defaultDeps(): ElevationDeps {
  return { elevation: getElevationProvider(), townsAlong: townsAlongDb, cache: routeDbCache };
}

/** Points every PROFILE_SAMPLE_M along the line and the last point, with their km from start. */
export function profileSamples(geometry: LineString): { points: LngLat[]; km: number[] } {
  const coords = geometry.coordinates as LngLat[];
  const points = resampleLine(coords, PROFILE_SAMPLE_M);
  const km = points.map((_, i) => (i * PROFILE_SAMPLE_M) / 1000);
  let total = 0;
  for (let i = 1; i < coords.length; i++) total += haversineM(coords[i - 1]!, coords[i]!);
  const last = coords.at(-1)!;
  if (total / 1000 - km.at(-1)! > 0.001) {
    points.push(last);
    km.push(total / 1000);
  }
  return { points, km };
}

/**
 * The elevation profile of a route, or null when too many heights could not be read. `cacheId`
 * (a route id) keys the cached result; without one the geometry itself is hashed.
 */
export async function routeProfile(
  geometry: LineString,
  cacheId: string | null,
  deps: ElevationDeps = defaultDeps(),
): Promise<ElevationProfile | null> {
  const key = cacheId ? `${CACHE_PREFIX}${cacheId}` : hashKey(`${CACHE_PREFIX}g`, geometry);
  const cached = await deps.cache.get(key).catch(() => undefined);
  if (cached) return cached as ElevationProfile;

  const { points, km } = profileSamples(geometry);
  if (points.length < 2) return null;
  const zoom = chooseZoom(points, MAX_ZOOM, MAX_TILES);
  const [raw, towns] = await Promise.all([
    deps.elevation.heights(points, zoom),
    deps.townsAlong(geometry).catch(() => [] as TownOnRoute[]),
  ]);
  const missing = raw.filter((h) => h === null).length / raw.length;
  if (missing > MAX_MISSING) return null;
  const heights = cleanHeights(raw);
  if (!heights) return null;

  const nearTown = (at: number): string | null => {
    let best: TownOnRoute | null = null;
    for (const t of towns) {
      const d = Math.abs(t.kmFromStart - at);
      if (d <= TOWN_WITHIN_KM && (!best || d < Math.abs(best.kmFromStart - at))) best = t;
    }
    return best?.name ?? null;
  };
  const profile = buildProfile(km, heights, zoom, nearTown);
  await deps.cache.set(key, profile).catch((err: unknown) => console.warn("Profile cache", err));
  return profile;
}
