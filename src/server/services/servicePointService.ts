import { and, eq, lt, sql } from "drizzle-orm";
import type { LineString } from "geojson";
import type { LngLat } from "@/lib/geo";
import { getDb } from "../db";
import { servicePoint } from "../db/schema";
import type { ServiceKind, ServicePointCandidate } from "./serviceClassify";

const BATCH = 500;

/** Inserts or updates service points (on osm_id); returns how many were written. */
export async function upsertServicePoints(
  candidates: ServicePointCandidate[],
  region: string,
): Promise<number> {
  // A way crossing two tiles comes twice; one row per OSM id in a statement.
  const unique = [...new Map(candidates.map((c) => [c.osmId, c])).values()];
  for (let i = 0; i < unique.length; i += BATCH) {
    const rows = unique.slice(i, i + BATCH).map((c) => ({
      osmId: c.osmId,
      kind: c.kind,
      name: c.name,
      phone: c.phone,
      region,
      location: c.location,
    }));
    await getDb()
      .insert(servicePoint)
      .values(rows)
      .onConflictDoUpdate({
        target: servicePoint.osmId,
        set: {
          kind: sql`excluded.kind`,
          name: sql`excluded.name`,
          phone: sql`excluded.phone`,
          region: sql`excluded.region`,
          location: sql`excluded.location`,
          updatedAt: sql`now()`,
        },
      });
  }
  return unique.length;
}

/** Deletes a region's service points the last import did not see (gone from OpenStreetMap). */
export async function deleteStaleServicePoints(region: string, importStartedAt: string) {
  const rows = await getDb()
    .delete(servicePoint)
    .where(
      and(eq(servicePoint.region, region), lt(servicePoint.updatedAt, new Date(importStartedAt))),
    )
    .returning({ osmId: servicePoint.osmId });
  return rows.length;
}

export interface ServiceAlongRow {
  osmId: string;
  kind: ServiceKind;
  name: string | null;
  phone: string | null;
  location: LngLat;
  kmFromStart: number;
  detourM: number;
}

interface RawRow extends Record<string, unknown> {
  osm_id: string;
  kind: ServiceKind;
  name: string | null;
  phone: string | null;
  lng: number;
  lat: number;
  km_from_start: number;
  detour_m: number;
}

/** Service points within `corridorM` of a route, in km order (services_along_route). */
export async function servicesAlong(
  geometry: LineString,
  corridorM: number,
  kinds: ServiceKind[] | null = null,
): Promise<ServiceAlongRow[]> {
  const rows = await getDb().execute<RawRow>(sql`
    SELECT * FROM services_along_route(${JSON.stringify(geometry)}, ${Math.round(corridorM)},
      ${sql.param(kinds)}::text[])`);
  return rows.map((r) => ({
    osmId: r.osm_id,
    kind: r.kind,
    name: r.name,
    phone: r.phone,
    location: [r.lng, r.lat],
    kmFromStart: Number(r.km_from_start),
    detourM: Number(r.detour_m),
  }));
}
