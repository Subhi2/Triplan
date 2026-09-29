import { sql } from "drizzle-orm";
import type { CreateTripRequest, SavedTrip, TripPlan, TripSummary } from "@/lib/savedTrip";
import {
  CORRIDOR_KM,
  DEFAULT_CORRIDOR_KM,
  SAME_STOP_M,
  VEHICLES,
  type CorridorKm,
  type Vehicle,
} from "@/lib/trip";
import { getDb } from "../db";

// Saved trips are open: no sign-in and no owners (user_id stays empty). Everyone sees the same
// list, and anyone with a trip's link can open, rename or update it.

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const MAX_LIST = 200;

interface TripRow extends Record<string, unknown> {
  id: string;
  title: string;
  vehicle: string;
  corridor_m: number;
  route_id: string | null;
  via_label: string | null;
  distance_m: number | null;
  duration_s: number | null;
  updated_at: string | Date;
}

interface StopRow extends Record<string, unknown> {
  label: string;
  lng: number;
  lat: number;
}

interface SummaryRow extends Record<string, unknown> {
  id: string;
  title: string;
  vehicle: string;
  via_label: string | null;
  distance_m: number | null;
  duration_s: number | null;
  updated_at: string | Date;
  from_label: string | null;
  to_label: string | null;
  stop_count: number;
}

const toVehicle = (v: string): Vehicle =>
  VEHICLES.includes(v as Vehicle) ? (v as Vehicle) : "bike";
const toCorridorKm = (m: number): CorridorKm =>
  CORRIDOR_KM.includes((m / 1000) as CorridorKm) ? ((m / 1000) as CorridorKm) : DEFAULT_CORRIDOR_KM;
const iso = (d: string | Date) => new Date(d).toISOString();

/** Replaces a trip's stops. A stop at one of our places (same name, within 150 m) links to it. */
async function writeStops(tx: Tx, tripId: string, stops: TripPlan["stops"]) {
  await tx.execute(sql`DELETE FROM trip_stop WHERE trip_id = ${tripId}`);
  for (const [position, stop] of stops.entries()) {
    const [lng, lat] = stop.location;
    await tx.execute(sql`
      INSERT INTO trip_stop (trip_id, position, label, location, place_id)
      SELECT ${tripId}, ${position}, ${stop.label}, s.pt,
             (SELECT p.id FROM place p
              WHERE p.status = 'verified' AND lower(p.name) = lower(${stop.label})
                AND ST_DWithin(p.location, s.pt, ${SAME_STOP_M})
              ORDER BY p.location <-> s.pt
              LIMIT 1)
      FROM (SELECT ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography AS pt) s`);
  }
}

function routeColumns(plan: TripPlan) {
  return {
    vehicle: plan.vehicle,
    corridorM: plan.corridorKm * 1000,
    geojson: JSON.stringify(plan.route.geometry),
    routeId: plan.route.id,
    viaLabel: plan.route.viaLabel,
    distanceM: Math.round(plan.route.distanceKm * 1000),
    durationS: Math.round(plan.route.durationMin * 60),
  };
}

export async function getTrip(id: string): Promise<SavedTrip | null> {
  const db = getDb();
  const [trip] = await db.execute<TripRow>(sql`
    SELECT id, title, vehicle::text AS vehicle, corridor_m, route_id, via_label, distance_m,
           duration_s, updated_at
    FROM trip WHERE id = ${id}`);
  if (!trip) return null;
  const stops = await db.execute<StopRow>(sql`
    SELECT label, ST_X(location::geometry) AS lng, ST_Y(location::geometry) AS lat
    FROM trip_stop WHERE trip_id = ${id}
    ORDER BY position`);
  return {
    id: trip.id,
    title: trip.title,
    vehicle: toVehicle(trip.vehicle),
    corridorKm: toCorridorKm(trip.corridor_m),
    stops: stops.map((s) => ({ label: s.label, location: [s.lng, s.lat] })),
    routeId: trip.route_id,
    viaLabel: trip.via_label,
    distanceKm: trip.distance_m === null ? null : trip.distance_m / 1000,
    durationMin: trip.duration_s === null ? null : Math.round(trip.duration_s / 60),
    updatedAt: iso(trip.updated_at),
  };
}

export async function createTrip(input: CreateTripRequest): Promise<SavedTrip> {
  const c = routeColumns(input);
  const id = await getDb().transaction(async (tx) => {
    const [row] = await tx.execute<{ id: string }>(sql`
      INSERT INTO trip (title, vehicle, corridor_m, route_geom, route_id, via_label, distance_m,
                        duration_s, is_public)
      VALUES (${input.title}, ${c.vehicle}, ${c.corridorM},
              ST_SetSRID(ST_GeomFromGeoJSON(${c.geojson}), 4326)::geography, ${c.routeId},
              ${c.viaLabel}, ${c.distanceM}, ${c.durationS}, true)
      RETURNING id`);
    await writeStops(tx, row!.id, input.stops);
    return row!.id;
  });
  return (await getTrip(id))!;
}

/** Renames a trip and/or replaces its plan. Null if there is no such trip. */
export async function updateTrip(
  id: string,
  update: { title?: string; plan?: TripPlan },
): Promise<SavedTrip | null> {
  const found = await getDb().transaction(async (tx) => {
    const { title, plan } = update;
    let rows: { id: string }[];
    if (plan) {
      const c = routeColumns(plan);
      rows = await tx.execute<{ id: string }>(sql`
        UPDATE trip SET
          title = coalesce(${title ?? null}, title),
          vehicle = ${c.vehicle}, corridor_m = ${c.corridorM},
          route_geom = ST_SetSRID(ST_GeomFromGeoJSON(${c.geojson}), 4326)::geography,
          route_id = ${c.routeId}, via_label = ${c.viaLabel},
          distance_m = ${c.distanceM}, duration_s = ${c.durationS}
        WHERE id = ${id}
        RETURNING id`);
      if (rows.length > 0) await writeStops(tx, id, plan.stops);
    } else {
      rows = await tx.execute<{ id: string }>(sql`
        UPDATE trip SET title = ${title ?? null} WHERE id = ${id} RETURNING id`);
    }
    return rows.length > 0;
  });
  return found ? getTrip(id) : null;
}

/** Every saved trip, most recently changed first. */
export async function listTrips(limit = MAX_LIST): Promise<TripSummary[]> {
  const rows = await getDb().execute<SummaryRow>(sql`
    SELECT t.id, t.title, t.vehicle::text AS vehicle, t.via_label, t.distance_m, t.duration_s,
           t.updated_at, s.from_label, s.to_label, s.stop_count
    FROM trip t
    CROSS JOIN LATERAL (
      SELECT (array_agg(label ORDER BY position))[1] AS from_label,
             (array_agg(label ORDER BY position DESC))[1] AS to_label,
             count(*)::int AS stop_count
      FROM trip_stop WHERE trip_id = t.id
    ) s
    ORDER BY t.updated_at DESC
    LIMIT ${limit}`);
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    vehicle: toVehicle(r.vehicle),
    from: r.from_label ?? "",
    to: r.to_label ?? "",
    viaCount: Math.max(0, r.stop_count - 2),
    viaLabel: r.via_label,
    distanceKm: r.distance_m === null ? null : r.distance_m / 1000,
    durationMin: r.duration_s === null ? null : Math.round(r.duration_s / 60),
    updatedAt: iso(r.updated_at),
  }));
}
