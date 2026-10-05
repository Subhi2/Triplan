import { describe, expect, it } from "vitest";
import {
  exportSelect,
  insertBatchSql,
  manifestProblems,
  manifestSchema,
  SNAPSHOT_TABLES,
  type SnapshotManifest,
} from "@/lib/snapshot";

const table = (name: SnapshotManifest["tables"][number]["name"], columns = ["id"]) => ({
  name,
  file: `${name}.ndjson.gz`,
  columns,
  rows: 1,
  bytes: 10,
  sha256: "a".repeat(64),
});
const manifest = (tables = SNAPSHOT_TABLES.map((t) => table(t))): SnapshotManifest => ({
  format: 1,
  createdAt: "2026-10-05T12:00:00Z",
  migration: "0015_service_point",
  licence: "ODbL",
  tables,
});

describe("data snapshot", () => {
  it("never exports Google ids, accounts, unchecked places or users' photos", () => {
    const place = exportSelect(
      "place",
      ["id", "name", "google_place_id", "created_by", "location"],
      ["location"],
    );
    expect(place).toContain('NULL AS "google_place_id"');
    expect(place).toContain('NULL AS "created_by"');
    expect(place).toContain('"location"::text AS "location"');
    expect(place).toContain("WHERE status IN ('verified', 'closed')");
    const media = exportSelect("media", ["id", "uploaded_by"]);
    expect(media).toContain('NULL AS "uploaded_by"');
    expect(media).toContain("source IN ('wikimedia', 'youtube', 'instagram')");
    expect(media).not.toContain("'user'");
    expect(exportSelect("category", ["id"])).toContain("ORDER BY parent_id NULLS FIRST, id");
    expect(SNAPSHOT_TABLES).not.toContain("trip");
    expect(() => exportSelect("place", ["id; DROP TABLE place"])).toThrow(/Bad identifier/);
  });

  it("inserts a batch of JSON rows into the named schema's table", () => {
    expect(insertBatchSql("ride", ["slug", "title"], "test_x")).toBe(
      'INSERT INTO "test_x"."ride" ("slug", "title") SELECT "slug", "title" FROM ' +
        'json_populate_recordset(NULL::"test_x"."ride", $1::text::json)',
    );
  });

  it("finds what stops a manifest from loading", () => {
    expect(manifestProblems(manifest(), ["0014_usage_daily", "0015_service_point"], {})).toEqual(
      [],
    );
    const problems = manifestProblems(
      manifest([table("place", ["id", "shiny_new_column"]), table("place")]),
      ["0014_usage_daily"],
      { place: ["id"] },
    );
    expect(problems).toContain("The snapshot has no ride table.");
    expect(problems).toContain("The snapshot has place 2 times.");
    expect(problems.some((p) => p.includes("0015_service_point"))).toBe(true);
    expect(problems).toContain("place has no column shiny_new_column in this database.");
  });

  it("validates the manifest's file names and checksums", () => {
    expect(manifestSchema.safeParse(manifest()).success).toBe(true);
    const bad = manifest([{ ...table("place"), file: "../etc/passwd" }]);
    expect(manifestSchema.safeParse(bad).success).toBe(false);
  });
});
