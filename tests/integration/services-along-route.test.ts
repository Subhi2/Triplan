import type { LineString } from "geojson";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/server/db";
import { servicesAlong, upsertServicePoints } from "@/server/services/servicePointService";

// Test rows live in a region name of their own and are removed afterwards.
const REGION = "test:services";

describe.skipIf(!process.env.DATABASE_URL)("services_along_route", () => {
  // 20 km due north from a point in the Arabian Sea, far from real data.
  const line: LineString = {
    type: "LineString",
    coordinates: [
      [70, 10],
      [70, 10.18],
    ],
  };
  beforeAll(async () => {
    await upsertServicePoints(
      [
        {
          osmId: "test/1",
          kind: "hospital",
          name: "On the road",
          phone: "108",
          location: [70.001, 10.05],
        },
        {
          osmId: "test/2",
          kind: "atm",
          name: "Off the road",
          phone: null,
          location: [70.03, 10.1],
        },
        { osmId: "test/3", kind: "police", name: "Far away", phone: null, location: [70.3, 10.1] },
      ],
      REGION,
    );
  });
  afterAll(async () => {
    await getDb().execute(sql`DELETE FROM service_point WHERE region = ${REGION}`);
    await closeDb();
  });

  it("finds the points within the corridor, in km order, with their detour", async () => {
    const rows = (await servicesAlong(line, 5_000)).filter((r) => r.osmId.startsWith("test/"));
    expect(rows.map((r) => r.osmId)).toEqual(["test/1", "test/2"]);
    expect(rows[0]!.kmFromStart).toBeCloseTo(5.6, 0);
    expect(rows[0]!.detourM).toBeLessThan(200);
    expect(rows[1]!.detourM).toBeGreaterThan(3_000);
  });

  it("filters by kind", async () => {
    const rows = (await servicesAlong(line, 5_000, ["hospital"])).filter((r) =>
      r.osmId.startsWith("test/"),
    );
    expect(rows.map((r) => r.kind)).toEqual(["hospital"]);
  });
});
