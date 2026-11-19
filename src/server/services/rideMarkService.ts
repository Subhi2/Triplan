import { sql } from "drizzle-orm";
import type { RideMark, RideMarkInput } from "@/lib/community/schemas";
import { getDb } from "../db";
import { CommunityError } from "./clubService";

// A rider's bucket list of famous rides: private to them, kept against their device account.

interface MarkRow extends Record<string, unknown> {
  rideSlug: string;
  status: RideMark["status"];
  doneOn: string | null;
  note: string;
}

/** Every mark this rider has made. */
export async function marksOf(riderId: string): Promise<RideMark[]> {
  const rows = await getDb().execute<MarkRow>(sql`
    SELECT ride_slug AS "rideSlug", status, done_on::text AS "doneOn", note
    FROM ride_mark WHERE rider_id = ${riderId}
    ORDER BY updated_at DESC`);
  return rows.map((r) => ({
    rideSlug: r.rideSlug,
    status: r.status,
    doneOn: r.doneOn,
    note: r.note,
  }));
}

/** Marks a ride pending or done, replacing any earlier mark; 404 for a ride we do not have. */
export async function saveMark(riderId: string, input: RideMarkInput): Promise<RideMark> {
  const [ride] = await getDb().execute<{ slug: string }>(
    sql`SELECT slug FROM ride WHERE slug = ${input.rideSlug}`,
  );
  if (!ride) throw new CommunityError("Ride not found", 404);
  await getDb().execute(sql`
    INSERT INTO ride_mark (rider_id, ride_slug, status, done_on, note)
    VALUES (${riderId}, ${input.rideSlug}, ${input.status}, ${input.doneOn}, ${input.note})
    ON CONFLICT (rider_id, ride_slug) DO UPDATE
      SET status = excluded.status, done_on = excluded.done_on, note = excluded.note,
          updated_at = now()`);
  return {
    rideSlug: input.rideSlug,
    status: input.status,
    doneOn: input.doneOn,
    note: input.note,
  };
}

/** Removes a mark; true when there was one. */
export async function removeMark(riderId: string, rideSlug: string): Promise<boolean> {
  const rows = await getDb().execute(sql`
    DELETE FROM ride_mark WHERE rider_id = ${riderId} AND ride_slug = ${rideSlug}
    RETURNING 1`);
  return rows.length > 0;
}
