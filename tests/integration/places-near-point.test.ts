import { afterAll, describe, expect, it } from "vitest";
import type { LngLat } from "@/lib/geo";
import { haversineM } from "@/lib/geo";
import { closeDb } from "@/server/db";
import { placesNearDb } from "@/server/services/nearbyService";

// Read-only: the integration DB is the live one (.env.local).
const SAKLESHPUR: LngLat = [75.785, 12.943];

describe.skipIf(!process.env.DATABASE_URL)("places near a point", () => {
  afterAll(() => closeDb());

  it("finds Manjarabad Fort near Sakleshpur and not Mullayanagiri", async () => {
    const slugs = (await placesNearDb(SAKLESHPUR, 20_000, null)).map((p) => p.slug);
    expect(slugs).toContain("manjarabad-fort");
    expect(slugs).not.toContain("mullayanagiri");
  });

  it("keeps every place inside the radius, in [lng, lat] order", async () => {
    const places = await placesNearDb(SAKLESHPUR, 20_000, null);
    expect(places.length).toBeGreaterThan(0);
    for (const p of places) {
      expect(p.distanceM).toBeLessThanOrEqual(20_000);
      // Our own great-circle distance agrees with PostGIS to within 0.5 %.
      expect(Math.abs(haversineM(SAKLESHPUR, p.location) - p.distanceM)).toBeLessThan(
        Math.max(50, p.distanceM * 0.005),
      );
    }
  });

  it("orders by priority, most worthwhile first", async () => {
    const places = await placesNearDb(SAKLESHPUR, 30_000, null);
    for (let i = 1; i < places.length; i++) {
      expect(places[i - 1]!.priority).toBeGreaterThanOrEqual(places[i]!.priority);
    }
  });

  it("filters by category and leaves out towns by default", async () => {
    const forts = await placesNearDb(SAKLESHPUR, 30_000, ["fort"]);
    expect(forts.length).toBeGreaterThan(0);
    expect(forts.every((p) => p.category === "fort")).toBe(true);

    const all = await placesNearDb(SAKLESHPUR, 30_000, null);
    expect(all.some((p) => p.category === "town")).toBe(false);
  });

  it("respects the limit", async () => {
    expect((await placesNearDb(SAKLESHPUR, 50_000, null, 3)).length).toBeLessThanOrEqual(3);
  });

  it("returns the seeded best months", async () => {
    const fort = (await placesNearDb(SAKLESHPUR, 20_000, ["fort"])).find(
      (p) => p.slug === "manjarabad-fort",
    );
    expect(fort?.bestMonths.length).toBeGreaterThan(0);
  });
});
