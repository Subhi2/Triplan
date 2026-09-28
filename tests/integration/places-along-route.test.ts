import type { LineString } from "geojson";
import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/server/db";

// Straight segments between the towns on the Sakleshpur route (docs/06 town coordinates).
// A real road geometry replaces this in Phase 2 via a recorded OSRM fixture.
const viaSakleshpur: LineString = {
  type: "LineString",
  coordinates: [
    [77.5946, 12.9716], // Bengaluru
    [77.0272, 13.0232], // Kunigal
    [76.39, 12.903], // Channarayapatna
    [76.0996, 13.0068], // Hassan
    [75.785, 12.943], // Sakleshpur
    [75.64, 13.136], // Mudigere
    [75.524, 13.118], // Kottigehara
    [75.356, 13.234], // Kalasa
  ],
};

interface Row {
  slug: string;
  category: string;
  km_from_start: number;
  detour_m: number;
}

async function placesAlong(line: LineString, corridorM: number, categories: string[] | null) {
  const rows = await getDb().execute<Row & Record<string, unknown>>(
    sql`SELECT slug, category, km_from_start, detour_m
        FROM places_along_route(${JSON.stringify(line)}, ${corridorM}, ${sql.param(categories)}::text[])`,
  );
  return [...rows];
}

describe.skipIf(!process.env.DATABASE_URL)("places_along_route", () => {
  afterAll(() => closeDb());

  // Town-to-town segments cut corners, so Manjarabad Fort (on NH75 ~6 km west of Sakleshpur
  // town centre) sits just outside 5 km of this line. 10 km keeps the test about the function.
  it("returns Manjarabad Fort and not Belur on the Sakleshpur route", async () => {
    const rows = await placesAlong(viaSakleshpur, 10_000, null);
    const slugs = rows.map((r) => r.slug);

    expect(slugs).toContain("manjarabad-fort");
    expect(slugs).toContain("ballalarayana-durga");
    expect(slugs).not.toContain("belur-chennakeshava");
    expect(slugs).not.toContain("mullayanagiri");
  });

  it("orders by km from start and reports detours within the corridor", async () => {
    const rows = await placesAlong(viaSakleshpur, 10_000, null);
    const kms = rows.map((r) => Number(r.km_from_start));

    expect(kms).toEqual([...kms].sort((a, b) => a - b));
    for (const r of rows) expect(Number(r.detour_m)).toBeLessThanOrEqual(10_000);
  });

  it("hides towns by default and filters by category", async () => {
    const all = await placesAlong(viaSakleshpur, 10_000, null);
    expect(all.some((r) => r.category === "town")).toBe(false);

    const forts = await placesAlong(viaSakleshpur, 10_000, ["fort"]);
    expect(forts.map((r) => r.slug)).toEqual(["manjarabad-fort"]);

    const towns = await placesAlong(viaSakleshpur, 2_000, ["town"]);
    expect(towns.map((r) => r.slug)).toContain("sakleshpur");
  });
});
