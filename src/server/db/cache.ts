import { and, eq, gt, sql } from "drizzle-orm";
import { getDb } from ".";
import { geocodeCache, routeCache } from "./schema";

/** A JSON cache. Implementations: DB tables below, or a Map in tests. */
export interface JsonCache {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function since(ttlMs: number) {
  return new Date(Date.now() - ttlMs);
}

/** route_cache, 7 days (docs/02-architecture.md "Caching"). */
export const routeDbCache: JsonCache = {
  async get(key) {
    const [row] = await getDb()
      .select({ response: routeCache.response })
      .from(routeCache)
      .where(and(eq(routeCache.key, key), gt(routeCache.createdAt, since(7 * DAY_MS))));
    return row?.response;
  },
  async set(key, value) {
    await getDb()
      .insert(routeCache)
      .values({ key, response: value })
      .onConflictDoUpdate({
        target: routeCache.key,
        set: { response: value, createdAt: sql`now()` },
      });
  },
};

/** geocode_cache, 30 days. */
export const geocodeDbCache: JsonCache = {
  async get(key) {
    const [row] = await getDb()
      .select({ response: geocodeCache.response })
      .from(geocodeCache)
      .where(and(eq(geocodeCache.query, key), gt(geocodeCache.createdAt, since(30 * DAY_MS))));
    return row?.response;
  },
  async set(key, value) {
    await getDb()
      .insert(geocodeCache)
      .values({ query: key, response: value })
      .onConflictDoUpdate({
        target: geocodeCache.query,
        set: { response: value, createdAt: sql`now()` },
      });
  },
};
