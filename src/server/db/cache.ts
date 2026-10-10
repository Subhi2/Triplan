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

/**
 * Weather forecasts, 1 hour (MET Norway updates them about every 30 minutes). Kept in
 * geocode_cache under "metno:" keys; the daily health check deletes them after a day.
 */
export const weatherDbCache: JsonCache = {
  async get(key) {
    const [row] = await getDb()
      .select({ response: geocodeCache.response })
      .from(geocodeCache)
      .where(and(eq(geocodeCache.query, key), gt(geocodeCache.createdAt, since(60 * 60 * 1000))));
    return row?.response;
  },
  set: (key, value) => geocodeDbCache.set(key, value),
};

/** Deletes cached forecasts older than a day. Returns how many were deleted. */
export async function forgetOldForecasts(): Promise<number> {
  const rows = await getDb().execute(sql`
    DELETE FROM geocode_cache
    WHERE query LIKE 'metno:%' AND created_at < now() - interval '1 day'
    RETURNING query`);
  return rows.length;
}

/** Rows deleted per table per daily run, so the first clean-up of a big table stays quick. */
const PRUNE_BATCH = 5000;

/**
 * Deletes cache rows no reader will use again: route_cache past its 7 days (routes, tables and
 * elevation profiles), geocode_cache past its 30 days. Returns how many rows were deleted.
 */
export async function forgetOldCache(): Promise<{ routes: number; geocodes: number }> {
  const db = getDb();
  const routes = await db.execute(sql`
    DELETE FROM route_cache WHERE key IN (
      SELECT key FROM route_cache WHERE created_at < now() - interval '8 days' LIMIT ${PRUNE_BATCH})
    RETURNING key`);
  const geocodes = await db.execute(sql`
    DELETE FROM geocode_cache WHERE query IN (
      SELECT query FROM geocode_cache WHERE created_at < now() - interval '31 days'
      LIMIT ${PRUNE_BATCH})
    RETURNING query`);
  return { routes: routes.length, geocodes: geocodes.length };
}

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
