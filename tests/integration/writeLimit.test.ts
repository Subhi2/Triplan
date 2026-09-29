import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/server/db";
import { allowWrite, visitorKey, WRITES_PER_HOUR } from "@/server/services/writeLimit";

describe.skipIf(!process.env.DATABASE_URL)("write limit", () => {
  const ip = `test-${Date.now()}`;
  const request = new Request("http://localhost/", { headers: { "x-forwarded-for": ip } });
  afterAll(async () => {
    await getDb().execute(sql`DELETE FROM write_limit WHERE key = ${visitorKey(ip)}`);
    await closeDb();
  });

  it("allows the hourly number of writes, then refuses", async () => {
    for (let i = 0; i < WRITES_PER_HOUR; i++) expect(await allowWrite(request)).toBe(true);
    expect(await allowWrite(request)).toBe(false);
  });

  it("starts a new window after an hour", async () => {
    await getDb().execute(
      sql`UPDATE write_limit SET window_start = now() - interval '61 minutes' WHERE key = ${visitorKey(ip)}`,
    );
    expect(await allowWrite(request)).toBe(true);
  });
});
