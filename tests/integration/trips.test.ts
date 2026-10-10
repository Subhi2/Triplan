import { sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import type { TripPlan } from "@/lib/savedTrip";
import { closeDb, getDb } from "@/server/db";
import {
  createTrip,
  getTrip,
  listTrips,
  tripEditAccess,
  updateTrip,
} from "@/server/services/tripService";

// Against the seeded database (`pnpm db:seed`, migrations through 0017). The trip gets a unique
// title and is deleted afterwards.

describe.skipIf(!process.env.DATABASE_URL)("saved trips", () => {
  const title = `Integration trip ${Date.now()}`;
  afterAll(async () => {
    await getDb().execute(sql`DELETE FROM trip WHERE title LIKE ${`${title}%`}`);
    await closeDb();
  });

  it("saves, renames, updates and lists a trip, linking stops to places", async () => {
    const plan: TripPlan = {
      stops: [
        { label: "Bengaluru", location: [77.5946, 12.9716] },
        { label: "Manjarabad Fort", location: [75.7581, 12.9173] },
        { label: "Kalasa", location: [75.356, 13.234] },
      ],
      vehicle: "bike",
      corridorKm: 5,
      route: {
        id: "test-route-1",
        geometry: {
          type: "LineString",
          coordinates: [
            [77.5946, 12.9716],
            [75.7581, 12.9173],
            [75.356, 13.234],
          ],
        },
        distanceKm: 330.8,
        durationMin: 402,
        viaLabel: "via Manjarabad Fort",
      },
    };
    const { trip: created, editToken } = await createTrip({ title, ...plan });
    expect(editToken).toMatch(/^[\w-]{43}$/);
    expect(created).toMatchObject({
      title,
      vehicle: "bike",
      corridorKm: 5,
      routeId: "test-route-1",
      viaLabel: "via Manjarabad Fort",
      distanceKm: 330.8,
      durationMin: 402,
      stops: plan.stops,
    });

    const linked = await getDb().execute<{ label: string; slug: string | null }>(sql`
      SELECT s.label, p.slug FROM trip_stop s LEFT JOIN place p ON p.id = s.place_id
      WHERE s.trip_id = ${created.id} ORDER BY s.position`);
    expect(linked.find((s) => s.label === "Manjarabad Fort")?.slug).toBe("manjarabad-fort");

    // Only the token that came back with the trip may change it; the database keeps its hash.
    expect(await tripEditAccess(created.id, editToken)).toBe("ok");
    expect(await tripEditAccess(created.id, null)).toBe("no-token");
    expect(await tripEditAccess(created.id, `${editToken}x`)).toBe("wrong-token");
    const [stored] = await getDb().execute<{ hash: string }>(
      sql`SELECT edit_token_hash AS hash FROM trip WHERE id = ${created.id}`,
    );
    expect(stored?.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored?.hash).not.toContain(editToken);

    const renamed = await updateTrip(created.id, { title: `${title} renamed` });
    expect(renamed?.title).toBe(`${title} renamed`);
    expect(renamed?.stops).toHaveLength(3);

    const shorter = await updateTrip(created.id, {
      plan: { ...plan, stops: [plan.stops[0]!, plan.stops[2]!], vehicle: "car", corridorKm: 10 },
    });
    expect(shorter).toMatchObject({
      title: `${title} renamed`,
      vehicle: "car",
      corridorKm: 10,
      stops: [plan.stops[0], plan.stops[2]],
    });

    expect(await listTrips([])).toEqual([]);
    expect((await listTrips([created.id])).find((t) => t.id === created.id)).toMatchObject({
      from: "Bengaluru",
      to: "Kalasa",
      viaCount: 0,
      vehicle: "car",
    });
  });

  it("is null for a trip that does not exist", async () => {
    const missing = "00000000-0000-4000-8000-000000000000";
    expect(await getTrip(missing)).toBeNull();
    expect(await tripEditAccess(missing, "x")).toBe("not-found");
    expect(await updateTrip(missing, { title: "x" })).toBeNull();
  });
});
