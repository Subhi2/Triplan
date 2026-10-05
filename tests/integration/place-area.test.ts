import type { LineString } from "geojson";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/server/db";
import { placesAlong } from "@/server/services/corridorService";

// A made-up park in the Arabian Sea (far from real data), 0.2° square, with its outline: a road
// through it must list it where the road enters, a road past it as a detour to the outline.
describe.skipIf(!process.env.DATABASE_URL)("places with an outline (national parks)", () => {
  const slug = `test-park-${Date.now()}`;
  const osmId = `test/park-${Date.now()}`;
  const through: LineString = {
    type: "LineString",
    coordinates: [
      [69.9, 10.1],
      [70.3, 10.1],
    ],
  };
  // 0.05° (about 5.5 km) north of the park's top edge.
  const past: LineString = {
    type: "LineString",
    coordinates: [
      [69.9, 10.25],
      [70.3, 10.25],
    ],
  };

  beforeAll(async () => {
    await getDb().execute(sql`
      INSERT INTO place (slug, name, category_id, location, area, status, source, osm_id)
      SELECT ${slug}, 'Test Tiger Reserve', c.id,
             ST_SetSRID(ST_MakePoint(70.1, 10.1), 4326)::geography,
             ST_Multi(ST_GeomFromText('POLYGON((70 10, 70.2 10, 70.2 10.2, 70 10.2, 70 10))', 4326))::geography,
             'verified', 'osm', ${osmId}
      FROM category c WHERE c.slug = 'wildlife'`);
  });

  afterAll(async () => {
    await getDb().execute(sql`DELETE FROM place WHERE slug LIKE 'test-park-%'`);
    await closeDb();
  });

  it("lists the park on a road through it, at the km where the road enters", async () => {
    const [park] = (await placesAlong(through, 2_000, ["wildlife"])).filter((p) => p.slug === slug);
    expect(park).toBeDefined();
    expect(park!.detourM).toBe(0);
    // 0.1° of longitude at 10.1° N is about 10.96 km.
    expect(park!.kmFromStart).toBeCloseTo(10.96, 0);
    expect(park!.location[0]).toBeCloseTo(70, 2);
    expect(park!.location[1]).toBeCloseTo(10.1, 2);
  });

  it("measures a road past the park to its edge, not its centre", async () => {
    const near = (await placesAlong(past, 10_000, ["wildlife"])).find((p) => p.slug === slug);
    expect(near!.detourM).toBeGreaterThan(5_000);
    expect(near!.detourM).toBeLessThan(6_000);
    const narrow = await placesAlong(past, 2_000, ["wildlife"]);
    expect(narrow.some((p) => p.slug === slug)).toBe(false);
  });
});
