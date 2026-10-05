import { z } from "zod";

// The data snapshot (docs/02-architecture.md, "One-command data setup"): our public tables as
// gzipped JSON lines with a manifest, so a fresh clone gets every place, photo credit, famous ride and
// service point with `pnpm db:setup` instead of hours of throttled imports.

export const SNAPSHOT_FORMAT = 1;

/** Tables in the snapshot, in load order (a table comes after the tables it points at). */
export const SNAPSHOT_TABLES = [
  "category",
  "carry_item",
  "place",
  "place_guide",
  "place_carry",
  "media",
  "ride",
  "service_point",
] as const;
export type SnapshotTable = (typeof SNAPSHOT_TABLES)[number];

/**
 * Columns written as empty: Google place ids (Maps ToS 3.2.3(b) lets only us keep them, and a
 * copy is no use without our key), and who added or checked a row (accounts are not shared).
 */
export const SNAPSHOT_NULLED: Partial<Record<SnapshotTable, readonly string[]>> = {
  place: ["google_place_id", "google_place_checked_at", "created_by"],
  place_guide: ["verified_by"],
  media: ["uploaded_by"],
};

const PUBLIC_PLACE = "status IN ('verified', 'closed')";
const OF_PUBLIC_PLACE = `place_id IN (SELECT id FROM place WHERE ${PUBLIC_PLACE})`;

/**
 * Rows left out: places nobody has checked yet, and media that are not verified, are users'
 * uploads, or belong to places left out. Media never hold Google content (it is never stored).
 */
export const SNAPSHOT_WHERE: Partial<Record<SnapshotTable, string>> = {
  place: PUBLIC_PLACE,
  place_guide: OF_PUBLIC_PLACE,
  place_carry: OF_PUBLIC_PLACE,
  media: `status = 'verified' AND source IN ('wikimedia', 'youtube', 'instagram') AND ${OF_PUBLIC_PLACE}`,
};

/** Row order in each file: stable, so a refresh with few changes has a small diff in size. */
const SNAPSHOT_ORDER: Record<SnapshotTable, string> = {
  category: "parent_id NULLS FIRST, id", // parents before their children
  carry_item: "id",
  place: "id",
  place_guide: "place_id",
  place_carry: "place_id, item_id",
  media: "id",
  ride: "position, slug",
  service_point: "osm_id",
};

/** Serial ids whose sequences are moved past the loaded rows. */
export const SNAPSHOT_SERIALS: Partial<Record<SnapshotTable, string>> = {
  category: "id",
  carry_item: "id",
};

/**
 * Tables outside the snapshot whose rows point at it (trips, reviews...). `db:setup --replace`
 * empties the snapshot tables only while these are empty: a database with them is in use.
 */
export const DEPENDENT_TABLES = ["trip", "trip_stop", "review", "social_post"] as const;

export const SNAPSHOT_LICENCE =
  "Open Database License (ODbL) 1.0. Contains information from OpenStreetMap " +
  "(© OpenStreetMap contributors, https://www.openstreetmap.org/copyright). " +
  "Photo files stay with their authors under the licence in each media row.";

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;
const quote = (name: string) => {
  if (!IDENTIFIER.test(name)) throw new Error(`Bad identifier: ${name}`);
  return `"${name}"`;
};

/**
 * The SELECT that writes a table's snapshot rows: left-out columns as NULL, and geography as its
 * hex EWKB text, which Postgres reads back as geography.
 */
export function exportSelect(
  table: SnapshotTable,
  columns: string[],
  spatial: string[] = [],
  limit?: number,
): string {
  const nulled = new Set(SNAPSHOT_NULLED[table] ?? []);
  const list = columns
    .map((c) =>
      nulled.has(c)
        ? `NULL AS ${quote(c)}`
        : spatial.includes(c)
          ? `${quote(c)}::text AS ${quote(c)}`
          : quote(c),
    )
    .join(", ");
  const where = SNAPSHOT_WHERE[table];
  return (
    `SELECT ${list} FROM ${quote(table)}` +
    (where ? ` WHERE ${where}` : "") +
    ` ORDER BY ${SNAPSHOT_ORDER[table]}` +
    (limit !== undefined ? ` LIMIT ${Math.trunc(limit)}` : "")
  );
}

/** One JSON object per row (a line of the table's .ndjson.gz file). */
export function exportRowsSql(
  table: SnapshotTable,
  columns: string[],
  spatial: string[] = [],
  limit?: number,
): string {
  return `SELECT row_to_json(r)::text AS line FROM (${exportSelect(table, columns, spatial, limit)}) r`;
}

/**
 * Inserts a batch of rows given as one JSON array ($1, sent as text so the driver does not encode
 * it again). Postgres turns each value into its column's type (arrays, enums, jsonb, timestamps,
 * geography from hex), so no driver streaming is needed.
 */
export function insertBatchSql(table: SnapshotTable, columns: string[], schema = "public"): string {
  const target = `${quote(schema)}.${quote(table)}`;
  const list = columns.map(quote).join(", ");
  return `INSERT INTO ${target} (${list}) SELECT ${list} FROM json_populate_recordset(NULL::${target}, $1::text::json)`;
}

/** Rows per insert when loading. */
export const LOAD_BATCH = 1_000;

export const manifestSchema = z.object({
  format: z.literal(SNAPSHOT_FORMAT),
  createdAt: z.string(),
  /** The newest migration the exporting database had: the loading database needs it too. */
  migration: z.string().regex(/^\d{4}_[a-z0-9_]+$/),
  licence: z.string(),
  tables: z.array(
    z.object({
      name: z.enum(SNAPSHOT_TABLES),
      file: z.string().regex(/^[a-z_]+\.ndjson\.gz$/),
      columns: z.array(z.string().regex(IDENTIFIER)).min(1),
      rows: z.number().int().nonnegative(),
      bytes: z.number().int().nonnegative(),
      sha256: z.string().regex(/^[0-9a-f]{64}$/),
    }),
  ),
});
export type SnapshotManifest = z.infer<typeof manifestSchema>;

/**
 * What stops a manifest from loading into a database: missing or repeated tables, a schema newer
 * than this clone's migrations, or columns the database does not have. Empty when it can load.
 */
export function manifestProblems(
  manifest: SnapshotManifest,
  migrations: string[],
  dbColumns: Partial<Record<SnapshotTable, string[]>>,
): string[] {
  const problems: string[] = [];
  const names = manifest.tables.map((t) => t.name);
  for (const t of SNAPSHOT_TABLES) {
    const n = names.filter((x) => x === t).length;
    if (n === 0) problems.push(`The snapshot has no ${t} table.`);
    if (n > 1) problems.push(`The snapshot has ${t} ${n} times.`);
  }
  if (!migrations.includes(manifest.migration)) {
    problems.push(
      `The snapshot was made with migration ${manifest.migration}, which this clone does not ` +
        "have: pull the latest code.",
    );
  }
  for (const t of manifest.tables) {
    const have = dbColumns[t.name];
    if (!have) continue;
    const missing = t.columns.filter((c) => !have.includes(c));
    if (missing.length > 0) {
      problems.push(`${t.name} has no column ${missing.join(", ")} in this database.`);
    }
  }
  return problems;
}
