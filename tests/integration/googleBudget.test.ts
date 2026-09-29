import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/server/db";
import { GOOGLE_DAILY_BUDGET, takeGoogleBudget } from "@/server/providers/google/budget";

describe.skipIf(!process.env.DATABASE_URL)("Google daily budget", () => {
  const today = sql`(now() AT TIME ZONE 'UTC')::date`;
  let saved: number | undefined;

  afterAll(async () => {
    // Put back today's real count, so the test never eats into the live budget.
    await getDb().execute(sql`DELETE FROM google_usage WHERE day = ${today} AND sku = 'photo'`);
    if (saved !== undefined) {
      await getDb().execute(
        sql`INSERT INTO google_usage (day, sku, count) VALUES (${today}, 'photo', ${saved})`,
      );
    }
    await closeDb();
  });

  it("allows the day's budget, then refuses", async () => {
    const [row] = await getDb().execute<{ count: number }>(
      sql`SELECT count FROM google_usage WHERE day = ${today} AND sku = 'photo'`,
    );
    saved = row?.count;
    const limit = GOOGLE_DAILY_BUDGET.photo;
    await getDb().execute(sql`
      INSERT INTO google_usage (day, sku, count) VALUES (${today}, 'photo', ${limit - 1})
      ON CONFLICT (day, sku) DO UPDATE SET count = ${limit - 1}`);
    expect(await takeGoogleBudget("photo")).toBe(true);
    expect(await takeGoogleBudget("photo")).toBe(false);
  });
});
