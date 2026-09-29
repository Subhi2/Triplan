import { sql } from "drizzle-orm";
import { getDb } from "../../db";

// Every Google call first takes one unit from the day's budget, so usage stays inside Google's
// free monthly caps (India price list: 7,000 a month for Enterprise + Atmosphere and photos).
// Counted in the database, so it holds across serverless instances. The Cloud console quotas
// are the second guard. See "Google Maps Platform" in docs/02-architecture.md.

export type GoogleSku = "ids" | "details_atmosphere" | "photo";

/**
 * Calls allowed per UTC day. 7,000 a month ÷ 31 = 225. ID lookups are free on Google's side;
 * their limit only stops runaway loops. On the global price list (1,000 free a month) lower
 * details_atmosphere and photo to 30.
 */
export const GOOGLE_DAILY_BUDGET: Record<GoogleSku, number> = {
  ids: 2000,
  details_atmosphere: 225,
  photo: 225,
};

/** Counts one call for today; false once the day's budget for the SKU is used up. */
export async function takeGoogleBudget(sku: GoogleSku): Promise<boolean> {
  const [row] = await getDb().execute<{ count: number }>(sql`
    INSERT INTO google_usage (day, sku, count) VALUES ((now() AT TIME ZONE 'UTC')::date, ${sku}, 1)
    ON CONFLICT (day, sku) DO UPDATE SET count = google_usage.count + 1
    RETURNING count`);
  return (row?.count ?? Infinity) <= GOOGLE_DAILY_BUDGET[sku];
}
