import { round5 } from "@/lib/geo";
import type { JsonCache } from "../../db/cache";
import { hashKey } from "../cacheKey";
import type { RouteInput, RouteResult, RoutingProvider } from "./types";

/** Cache key: waypoints rounded to 5 decimals, profile and alternatives. */
export function routeCacheKey(input: RouteInput): string {
  return hashKey("route:v1", {
    w: input.waypoints.map(([lng, lat]) => [round5(lng), round5(lat)]),
    p: input.profile,
    a: input.alternatives,
  });
}

export function withRouteCache(inner: RoutingProvider, cache: JsonCache): RoutingProvider {
  return {
    async route(input) {
      const key = routeCacheKey(input);
      const hit = (await cache.get(key)) as RouteResult[] | undefined;
      if (hit) return hit;
      const routes = await inner.route(input);
      await cache.set(key, routes);
      return routes;
    },
  };
}
