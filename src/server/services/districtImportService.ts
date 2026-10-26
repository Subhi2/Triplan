import { and, eq, lt, ne, sql } from "drizzle-orm";
import { getDb } from "../db";
import { district } from "../db/schema";
import type { OsmElement, RegionOutline } from "../providers/osm";
import type { OsmRegionKey } from "./osmRegions";

// India's districts from OpenStreetMap, for official alerts on a route (docs/02, "Alerts on the
// route"). Alerts name districts by LGD code ("ref:LGD:district" in OSM) or, for river floods, by
// name, so both are kept.

export interface DistrictCandidate {
  relationId: number;
  osmId: string; // "relation/2020603"
  lgdCode: number | null;
  name: string;
  names: string[];
  region: OsmRegionKey;
}

/** Lower case latin letters and single spaces, without "district": "Chikmagalur District" → "chikmagalur". */
export function normalizeDistrictName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip accents, as slugs do
    .toLowerCase()
    .replace(/[^a-z]+/g, " ")
    .trim()
    .replace(/ (district|dist)$/, "");
}

const NAME_TAGS = [
  "name",
  "name:en",
  "alt_name",
  "alt_name:en",
  "old_name",
  "official_name",
  "short_name",
];

/** Every name a district goes by, normalized, without repeats (names in other scripts drop out). */
export function districtNames(tags: Record<string, string>): string[] {
  const names = NAME_TAGS.flatMap((tag) => (tags[tag] ?? "").split(";")).map(normalizeDistrictName);
  return [...new Set(names.filter((n) => n.length >= 3))];
}

/** A district boundary from the Overpass answer, or null when it is not one we can use. */
export function districtFromElement(e: OsmElement, region: OsmRegionKey): DistrictCandidate | null {
  const id = /^relation\/(\d+)$/.exec(e.id);
  const name = (e.tags["name:en"] ?? e.tags.name ?? "").trim().replace(/\s+district$/i, "");
  if (!id || !name || e.tags.boundary !== "administrative" || e.tags.admin_level !== "5") {
    return null;
  }
  const lgd = Number(e.tags["ref:LGD:district"]);
  return {
    relationId: Number(id[1]),
    osmId: e.id,
    lgdCode: Number.isInteger(lgd) && lgd > 0 ? lgd : null,
    name,
    names: districtNames(e.tags),
    region,
  };
}

/**
 * Writes districts with their outlines (repaired and made multipolygons in SQL). An LGD code
 * moves to the district written last if two ever claim it. Returns how many were written.
 */
export async function upsertDistricts(
  rows: { candidate: DistrictCandidate; outline: RegionOutline }[],
): Promise<number> {
  const db = getDb();
  for (const { candidate: c, outline } of rows) {
    const geojson = JSON.stringify({ type: "MultiPolygon", coordinates: outline });
    if (c.lgdCode !== null) {
      await db
        .update(district)
        .set({ lgdCode: null })
        .where(and(eq(district.lgdCode, c.lgdCode), ne(district.osmId, c.osmId)));
    }
    const geom = sql`ST_Multi(ST_CollectionExtract(ST_MakeValid(
      ST_SetSRID(ST_GeomFromGeoJSON(${geojson}), 4326)), 3))::geography`;
    await db
      .insert(district)
      .values({
        osmId: c.osmId,
        lgdCode: c.lgdCode,
        name: c.name,
        names: c.names,
        region: c.region,
        geom,
        updatedAt: sql`now()`,
      })
      .onConflictDoUpdate({
        target: district.osmId,
        set: {
          lgdCode: c.lgdCode,
          name: c.name,
          names: c.names,
          region: c.region,
          geom,
          updatedAt: sql`now()`,
        },
      });
  }
  return rows.length;
}

/** Deletes a state's districts the last import did not see (gone from OpenStreetMap). */
export async function deleteStaleDistricts(region: OsmRegionKey, importStartedAt: string) {
  const gone = await getDb()
    .delete(district)
    .where(and(eq(district.region, region), lt(district.updatedAt, new Date(importStartedAt))))
    .returning({ osmId: district.osmId });
  return gone.length;
}
