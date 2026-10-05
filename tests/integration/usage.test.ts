import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/server/db";
import { countUsage, takeDailyBudget, usageTotal } from "@/server/services/usage";
import { allowRequest, visitorKey } from "@/server/services/writeLimit";

describe.skipIf(!process.env.DATABASE_URL)("usage counters and request limits", () => {
  const key = `test:usage-${Date.now()}` as const;
  const ip = `test-${Date.now()}`;
  const request = new Request("http://localhost/", { headers: { "x-forwarded-for": ip } });
  afterAll(async () => {
    await getDb().execute(sql`DELETE FROM usage_daily WHERE key LIKE 'test:%'`);
    await getDb().execute(sql`DELETE FROM write_limit WHERE key = ${`ai:${visitorKey(ip)}`}`);
    await closeDb();
  });

  it("adds up today's count and the total", async () => {
    expect(await countUsage(key)).toBe(1);
    expect(await countUsage(key, 4)).toBe(5);
    expect(await usageTotal(key)).toBe(5);
  });

  it("says no once the day's budget is used", async () => {
    const budget = `test:budget-${Date.now()}` as const;
    expect(await takeDailyBudget(budget, 2)).toBe(true);
    expect(await takeDailyBudget(budget, 2)).toBe(true);
    expect(await takeDailyBudget(budget, 2)).toBe(false);
  });

  it("limits a visitor per scope, apart from trip writes", async () => {
    const opts = { scope: "ai", limit: 2, windowS: 3600 };
    expect(await allowRequest(request, opts)).toBe(true);
    expect(await allowRequest(request, opts)).toBe(true);
    expect(await allowRequest(request, opts)).toBe(false);
    await getDb().execute(
      sql`UPDATE write_limit SET window_start = now() - interval '61 minutes' WHERE key = ${`ai:${visitorKey(ip)}`}`,
    );
    expect(await allowRequest(request, opts)).toBe(true);
  });
});
