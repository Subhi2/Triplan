import { routeDbCache } from "../../db/cache";
import { serverEnv } from "../../env";
import { withRouteCache } from "./cached";
import { createOsrmProvider } from "./osrm";
import type { RoutingProvider } from "./types";

export * from "./types";

let provider: RoutingProvider | undefined;

/** OSRM behind the route_cache table. Swap the inner provider here for Google Routes / GraphHopper. */
export function getRoutingProvider(): RoutingProvider {
  provider ??= withRouteCache(createOsrmProvider(serverEnv().OSRM_BASE_URL), routeDbCache);
  return provider;
}
