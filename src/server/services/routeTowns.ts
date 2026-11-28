import type { LineString } from "geojson";
import { OVERNIGHT_TOWN_M } from "@/lib/multiDay";
import { routeDbCache, type JsonCache } from "../db/cache";
import { hashKey } from "../providers/cacheKey";
import { softGet, softSet } from "../providers/softCache";
import { queryTownsAlong, type TownAlongRow, type TownNearLineRow } from "./corridorService";

// The towns along a route are wanted by four requests with different radii: the route's via
// labels (2 km), the weather (3 km), the elevation profile (2 km) and the overnight towns
// (5 km). They are fetched once per route at the widest of them and filtered for the others
// (docs/04, G9 step B7). Kept in this instance's memory and in route_cache (7 days), keyed by
// the line itself.

/** The widest radius any caller asks for; wider ones query directly. */
export const WIDEST_TOWN_M = OVERNIGHT_TOWN_M;

const MEMORY_MAX = 32;

export interface RouteTownsDeps {
  query(geometry: LineString, withinM: number): Promise<TownNearLineRow[]>;
  cache: JsonCache;
}

export function createRouteTowns(deps: RouteTownsDeps) {
  const memory = new Map<string, Promise<TownNearLineRow[]>>();

  async function widest(geometry: LineString): Promise<TownNearLineRow[]> {
    const key = hashKey("towns", geometry.coordinates);
    const held = memory.get(key);
    if (held) return held;
    const load = (async () => {
      const cached = (await softGet(deps.cache, key)) as TownNearLineRow[] | undefined;
      if (Array.isArray(cached)) return cached;
      const rows = await deps.query(geometry, WIDEST_TOWN_M);
      await softSet(deps.cache, key, rows);
      return rows;
    })();
    memory.set(key, load);
    // A failed load is not kept, so the next request tries again.
    load.catch(() => memory.delete(key));
    if (memory.size > MEMORY_MAX) memory.delete(memory.keys().next().value as string);
    return load;
  }

  /** Towns within `withinM` of the route, ordered by km (the same rows as one direct query). */
  return async function townsAlong(geometry: LineString, withinM: number): Promise<TownAlongRow[]> {
    const rows =
      withinM > WIDEST_TOWN_M ? await deps.query(geometry, withinM) : await widest(geometry);
    return rows
      .filter((t) => t.distanceM <= withinM)
      .map((t) => ({
        name: t.name,
        location: t.location,
        kmFromStart: t.kmFromStart,
        population: t.population,
        kind: t.kind,
      }));
  };
}

/** Towns along a route, from one lookup per route (see above). */
export const townsAlong = createRouteTowns({ query: queryTownsAlong, cache: routeDbCache });
