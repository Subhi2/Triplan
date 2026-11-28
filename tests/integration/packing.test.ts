import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/server/db";
import { packingFor } from "@/server/services/packingService";

const KALASA: [number, number] = [75.356, 13.234];

describe.skipIf(!process.env.DATABASE_URL)("packing list (G10)", () => {
  afterAll(closeDb);

  it("lists ride basics, the places' items for the month, and who asks for each", async () => {
    const rows = await getDb().execute<{ id: string }>(
      sql`SELECT id FROM place WHERE slug IN ('manjarabad-fort') AND status = 'verified'`,
    );
    const ids = rows.map((r) => r.id);
    expect(ids).toHaveLength(1);

    const july = await packingFor(ids, 7, KALASA);
    const slugs = july.map((i) => i.slug);
    expect(slugs).toEqual(expect.arrayContaining(["water_2l", "cash", "power_bank", "first_aid"]));
    // July is the monsoon on the Western Ghats.
    expect(slugs).toContain("raincoat");
    expect(july.find((i) => i.slug === "water_2l")!.for).toEqual(expect.any(Array));

    const empty = await packingFor([], 1, KALASA);
    expect(empty.map((i) => i.slug)).not.toContain("raincoat");
  });
});
