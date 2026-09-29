import type { JsonCache } from "../../db/cache";
import type { GeocodeHit, GeocodeOptions, GeocodingProvider } from "./types";

/**
 * Cache key: provider, normalised query and the options that change the result. The location bias
 * is rounded to a 0.5° grid and to pairs of zoom levels, so panning the map a little still hits.
 */
export function geocodeCacheKey(
  namespace: string,
  query: string,
  { limit = 5, viewbox, near, zoom }: GeocodeOptions = {},
): string {
  const half = (n: number) => Math.round(n * 2) / 2;
  const box = viewbox ? `:box=${viewbox.join(",")}` : "";
  const bias = near
    ? `:near=${half(near[0])},${half(near[1])},z${Math.round((zoom ?? 8) / 2) * 2}`
    : "";
  const q = query.trim().toLowerCase().replace(/\s+/g, " ");
  return `${namespace}:v2:${limit}${box}${bias}:${q}`;
}

export function withGeocodeCache(
  inner: GeocodingProvider,
  cache: JsonCache,
  namespace: string,
): GeocodingProvider {
  return {
    async search(query, options = {}) {
      const key = geocodeCacheKey(namespace, query, options);
      const hit = (await cache.get(key)) as GeocodeHit[] | undefined;
      if (hit) return hit;
      const results = await inner.search(query, options);
      await cache.set(key, results);
      return results;
    },
  };
}
