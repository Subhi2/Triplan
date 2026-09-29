import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db";
import { getPlaceDetail } from "@/server/services/placeDetailService";

// Against the seeded database (`pnpm db:seed`).

describe.skipIf(!process.env.DATABASE_URL)("place detail", () => {
  afterAll(() => closeDb());

  it("returns a seeded place with its guide and items to carry", async () => {
    const place = await getPlaceDetail("manjarabad-fort");
    expect(place).toMatchObject({
      name: "Manjarabad Fort",
      category: "fort",
      district: "Hassan",
      guide: {
        bestVehicles: ["bike", "car"],
        lastMileNote: "Right off NH75; about 250 steps up.",
        bestMonths: [8, 9, 10, 11, 12, 1],
        okMonths: [2, 3, 6, 7],
        visitDurationMin: 45,
        timings: null,
      },
      osm: { id: "relation/5419632" },
    });
    expect(place!.carry.map((c) => [c.slug, c.months])).toEqual(
      expect.arrayContaining([
        ["raincoat", [6, 7, 8, 9]],
        ["grip_shoes", []],
      ]),
    );
  });

  it("is null for an unknown place", async () => {
    expect(await getPlaceDetail("no-such-place-anywhere")).toBeNull();
  });
});
