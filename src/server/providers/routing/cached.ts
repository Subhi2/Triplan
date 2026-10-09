import { round3, round5 } from "@/lib/geo";
import type { JsonCache } from "../../db/cache";
import { hashKey } from "../cacheKey";
import { softGet, softSet } from "../softCache";
import type {
  RouteInput,
  RouteResult,
  RoutingProvider,
  RoutingTableProvider,
  TableCell,
  TableInput,
} from "./types";

/**
 * Cache key: waypoints rounded to 5 decimals, profile and alternatives. The version changes when
 * RouteResult does (v2: road stretches for the road mix).
 */
export function routeCacheKey(input: RouteInput): string {
  return hashKey("route:v2", {
    w: input.waypoints.map(([lng, lat]) => [round5(lng), round5(lat)]),
    p: input.profile,
    a: input.alternatives,
  });
}

export function withRouteCache(inner: RoutingProvider, cache: JsonCache): RoutingProvider {
  return {
    async route(input) {
      const key = routeCacheKey(input);
      const hit = (await softGet(cache, key)) as RouteResult[] | undefined;
      if (hit) return hit;
      const routes = await inner.route(input);
      await softSet(cache, key, routes);
      return routes;
    },
  };
}

/**
 * Cache key for road times from a point: the origin at 3 decimals (the precision the app keeps of
 * a user's position), the destinations at 5, and the profile. Kept in route_cache (7 days) under
 * "table:" keys, which route lookups (getRouteGeometry, "route:v2:") never read.
 */
export function tableCacheKey(input: TableInput): string {
  return hashKey("table:v1", {
    o: [round3(input.origin[0]), round3(input.origin[1])],
    d: input.destinations.map(([lng, lat]) => [round5(lng), round5(lat)]),
    p: input.profile,
  });
}

export function withTableCache(
  inner: RoutingTableProvider,
  cache: JsonCache,
): RoutingTableProvider {
  return {
    async table(input) {
      const key = tableCacheKey(input);
      const hit = (await softGet(cache, key)) as (TableCell | null)[] | undefined;
      if (hit) return hit;
      const cells = await inner.table(input);
      await softSet(cache, key, cells);
      return cells;
    },
  };
}
