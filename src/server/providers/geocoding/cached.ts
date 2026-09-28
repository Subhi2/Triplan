import type { JsonCache } from "../../db/cache";
import type { GeocodeHit, GeocodeOptions, GeocodingProvider } from "./types";

/** Cache key: the normalised query plus the options that change the result. */
export function geocodeCacheKey(
  query: string,
  { limit = 5, viewbox }: GeocodeOptions = {},
): string {
  const box = viewbox ? `:${viewbox.join(",")}` : "";
  return `v1:${limit}${box}:${query.trim().toLowerCase().replace(/\s+/g, " ")}`;
}

export function withGeocodeCache(inner: GeocodingProvider, cache: JsonCache): GeocodingProvider {
  return {
    async search(query, options = {}) {
      const key = geocodeCacheKey(query, options);
      const hit = (await cache.get(key)) as GeocodeHit[] | undefined;
      if (hit) return hit;
      const results = await inner.search(query, options);
      await cache.set(key, results);
      return results;
    },
  };
}
