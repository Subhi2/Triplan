import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  exportRowsSql,
  SNAPSHOT_FORMAT,
  SNAPSHOT_LICENCE,
  SNAPSHOT_TABLES,
  type SnapshotManifest,
  type SnapshotTable,
} from "@/lib/snapshot";
import { loadSnapshot, readSnapshotFiles, SnapshotError } from "@/server/services/snapshotLoad";

// A slice of each snapshot table exported from the live tables (read only) and loaded into a
// throwaway schema of look-alike tables, dropped afterwards.
describe.skipIf(!process.env.DATABASE_URL)("data snapshot round trip", () => {
  const sql = postgres(process.env.DATABASE_URL ?? "", {
    prepare: false,
    max: 1,
    onnotice: () => {},
  });
  const schema = `test_snapshot_${Date.now()}`;
  const manifest: SnapshotManifest = {
    format: SNAPSHOT_FORMAT,
    createdAt: new Date().toISOString(),
    migration: "0015_service_point",
    licence: SNAPSHOT_LICENCE,
    tables: [],
  };
  const files = new Map<string, Buffer>();
  const sourceRows = new Map<SnapshotTable, Record<string, unknown>[]>();

  beforeAll(async () => {
    await sql.unsafe(`CREATE SCHEMA "${schema}"`);
    for (const name of SNAPSHOT_TABLES) {
      await sql.unsafe(
        `CREATE TABLE "${schema}"."${name}" (LIKE public."${name}" INCLUDING DEFAULTS)`,
      );
      const cols = await sql<{ column_name: string; udt_name: string }[]>`
        SELECT column_name, udt_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ${name} ORDER BY ordinal_position`;
      const columns = cols.map((c) => c.column_name);
      const spatial = cols.filter((c) => c.udt_name === "geography").map((c) => c.column_name);
      const lines = (
        await sql.unsafe<{ line: string }[]>(exportRowsSql(name, columns, spatial, 25))
      ).map((r) => r.line);
      sourceRows.set(
        name,
        lines.map((l) => JSON.parse(l) as Record<string, unknown>),
      );
      const gz = gzipSync(lines.length ? `${lines.join("\n")}\n` : "");
      const file = `${name}.ndjson.gz`;
      files.set(file, gz);
      manifest.tables.push({
        name,
        file,
        columns,
        rows: lines.length,
        bytes: gz.length,
        sha256: createHash("sha256").update(gz).digest("hex"),
      });
    }
  });

  afterAll(async () => {
    await sql.unsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await sql.end();
  });

  const read = async (file: string) => files.get(file)!;

  it("loads every row back with arrays, JSON, geography and nulled Google ids intact", async () => {
    const checked = await readSnapshotFiles(manifest, read);
    const counts = await loadSnapshot(sql, manifest, checked, { schema });
    for (const t of manifest.tables) expect(counts[t.name]).toBe(t.rows);

    const place = sourceRows.get("place")![0]!;
    const [back] = await sql.unsafe<Record<string, unknown>[]>(
      `SELECT name, location::text AS location, alt_names, osm_tags, google_place_id
       FROM "${schema}".place WHERE id = $1`,
      [place.id as string],
    );
    expect(back).toMatchObject({
      name: place.name,
      location: place.location,
      alt_names: place.alt_names,
      google_place_id: null,
    });
    expect(back!.osm_tags).toEqual(place.osm_tags);

    const ride = sourceRows.get("ride")![0];
    if (ride) {
      const [r] = await sql.unsafe<{ ok: boolean; best_months: number[] }[]>(
        `SELECT ST_Equals(r.route_geom::geometry, $1::geography::geometry) AS ok, r.best_months
         FROM "${schema}".ride r WHERE slug = $2`,
        [ride.route_geom as string, ride.slug as string],
      );
      expect(r).toEqual({ ok: true, best_months: ride.best_months });
    }

    // Loading again with replace gives the same rows, not twice as many.
    const again = await loadSnapshot(sql, manifest, checked, { schema, replace: true });
    expect(again.place).toBe(counts.place);
  });

  it("refuses a file that does not match the manifest", async () => {
    const damaged = async (file: string) =>
      file === "place.ndjson.gz" ? Buffer.concat([files.get(file)!, Buffer.from("x")]) : read(file);
    await expect(readSnapshotFiles(manifest, damaged)).rejects.toBeInstanceOf(SnapshotError);
  });
});
