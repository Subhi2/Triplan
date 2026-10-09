import type { JsonCache } from "../db/cache";

// The provider caches live in the database. When it is down, routing and search still work:
// a failed read counts as a miss and a failed write is skipped.

export async function softGet(cache: JsonCache, key: string): Promise<unknown> {
  try {
    return await cache.get(key);
  } catch (err) {
    console.warn(`Cache read failed, calling the service: ${(err as Error).message}`);
    return undefined;
  }
}

export async function softSet(cache: JsonCache, key: string, value: unknown): Promise<void> {
  try {
    await cache.set(key, value);
  } catch (err) {
    console.warn(`Cache write failed: ${(err as Error).message}`);
  }
}
