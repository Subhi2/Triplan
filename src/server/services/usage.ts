import { after } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "../db";

// Counts per UTC day in usage_daily: routes planned (shown on About), AI requests and tokens (the
// AI budget). Counted in the database, so it holds across serverless instances. Nothing about who
// asked is stored.

export type UsageKey = "route_planned" | "ai_trip" | "ai_tokens_in" | "ai_tokens_out" | "story";

/** Adds `by` to today's count for `key`; returns the new count for today. */
export async function countUsage(key: UsageKey | `test:${string}`, by = 1): Promise<number> {
  const [row] = await getDb().execute<{ count: number }>(sql`
    INSERT INTO usage_daily (day, key, count) VALUES ((now() AT TIME ZONE 'UTC')::date, ${key}, ${by})
    ON CONFLICT (day, key) DO UPDATE SET count = usage_daily.count + ${by}
    RETURNING count`);
  return row?.count ?? 0;
}

/** Counts one use for today; false once today's count is over `limit`. */
export async function takeDailyBudget(
  key: UsageKey | `test:${string}`,
  limit: number,
): Promise<boolean> {
  return (await countUsage(key)) <= limit;
}

/** The count for `key` over all days. */
export async function usageTotal(key: UsageKey | `test:${string}`): Promise<number> {
  const [row] = await getDb().execute<{ total: number }>(sql`
    SELECT coalesce(sum(count), 0)::int AS total FROM usage_daily WHERE key = ${key}`);
  return row?.total ?? 0;
}

/**
 * Counts a use after the response has been sent, so counting never slows or fails a request.
 * Outside a request (scripts, tests) it counts in the background.
 */
export function countLater(key: UsageKey): void {
  const count = () =>
    countUsage(key).catch((err: unknown) => console.warn(`Could not count ${key}`, err));
  try {
    after(count);
  } catch {
    void count();
  }
}
