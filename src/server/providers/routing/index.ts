import { routeDbCache } from "../../db/cache";
import { serverEnv } from "../../env";
import { withRouteCache, withTableCache } from "./cached";
import { createOsrmProvider, createOsrmTableProvider } from "./osrm";
import type { RoutingProvider, RoutingTableProvider } from "./types";

export * from "./types";

let provider: RoutingProvider | undefined;

/** OSRM behind the route_cache table. Swap the inner provider here for Google Routes / GraphHopper. */
export function getRoutingProvider(): RoutingProvider {
  provider ??= withRouteCache(createOsrmProvider(serverEnv().OSRM_BASE_URL), routeDbCache);
  return provider;
}

let tableProvider: RoutingTableProvider | undefined;

/** Road times from one point to many (OSRM /table), behind the same route_cache table. */
export function getRoutingTableProvider(): RoutingTableProvider {
  tableProvider ??= withTableCache(
    createOsrmTableProvider(serverEnv().OSRM_BASE_URL),
    routeDbCache,
  );
  return tableProvider;
}
