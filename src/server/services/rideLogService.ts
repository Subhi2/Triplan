import { sql } from "drizzle-orm";
import type { LogEntryInput, RideLogEntry } from "@/lib/rideLog";
import { getDb } from "../db";

// The rider's ride log (G11): their own rows in ride_log, and the famous rides they marked done
// (ride_mark with the ride's own numbers). Private to the rider.

/** Every ride in the rider's log, newest first. */
export async function logOf(riderId: string): Promise<RideLogEntry[]> {
  const rows = await getDb().execute<Record<string, unknown>>(sql`
    SELECT id::text AS id, ridden_on::text AS ridden_on, title, distance_km, hairpins, climb_m,
           NULL AS ride_slug
    FROM ride_log WHERE rider_id = ${riderId}
    UNION ALL
    SELECT 'ride:' || r.slug, coalesce(m.done_on, m.updated_at::date)::text, r.title,
           r.distance_m / 1000.0, r.hairpins, r.ascent_m, r.slug
    FROM ride_mark m JOIN ride r ON r.slug = m.ride_slug
    WHERE m.rider_id = ${riderId} AND m.status = 'done'
    ORDER BY 2 DESC`);
  return rows.map((r) => ({
    id: String(r.id),
    riddenOn: String(r.ridden_on),
    title: String(r.title),
    distanceKm: Math.round(Number(r.distance_km) * 10) / 10,
    hairpins: Number(r.hairpins ?? 0),
    climbM: r.climb_m == null ? null : Number(r.climb_m),
    rideSlug: r.ride_slug == null ? null : String(r.ride_slug),
  }));
}

/** Logs a ride; a trip logged again replaces its entry. */
export async function addToLog(riderId: string, e: LogEntryInput): Promise<void> {
  if (e.tripId) {
    await getDb().execute(sql`
      DELETE FROM ride_log WHERE rider_id = ${riderId} AND trip_id = ${e.tripId}`);
  }
  await getDb().execute(sql`
    INSERT INTO ride_log (rider_id, ridden_on, title, distance_km, hairpins, climb_m, trip_id)
    VALUES (${riderId}, ${e.riddenOn}, ${e.title}, ${e.distanceKm}, ${e.hairpins}, ${e.climbM},
            ${e.tripId})`);
}

/** Takes one of the rider's own entries out of the log. */
export async function removeFromLog(riderId: string, id: string): Promise<boolean> {
  const rows = await getDb().execute(sql`
    DELETE FROM ride_log WHERE rider_id = ${riderId} AND id = ${id} RETURNING 1`);
  return rows.length > 0;
}
