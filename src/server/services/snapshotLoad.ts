import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import type { Sql } from "postgres";
import {
  insertBatchSql,
  LOAD_BATCH,
  SNAPSHOT_SERIALS,
  SNAPSHOT_TABLES,
  type SnapshotManifest,
  type SnapshotTable,
} from "@/lib/snapshot";

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SnapshotError";
  }
}

/** Every file's bytes, checked against the manifest's size and sha256 before anything is written. */
export async function readSnapshotFiles(
  manifest: SnapshotManifest,
  read: (file: string) => Promise<Buffer>,
): Promise<Map<SnapshotTable, Buffer>> {
  const files = new Map<SnapshotTable, Buffer>();
  for (const t of manifest.tables) {
    const bytes = await read(t.file);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (bytes.length !== t.bytes || sha256 !== t.sha256) {
      throw new SnapshotError(
        `${t.file} does not match the manifest (damaged or a different copy).`,
      );
    }
    files.set(t.name, bytes);
  }
  return files;
}

const q = (name: string) => `"${name.replace(/"/g, '""')}"`;

/**
 * Loads a checked snapshot in one transaction, in table order, a thousand rows per insert; with
 * `replace`, the snapshot tables are emptied first (the caller checks nothing depends on them).
 * Moves serial sequences past the loaded ids. Returns the row count of each table afterwards.
 */
export async function loadSnapshot(
  sql: Sql,
  manifest: SnapshotManifest,
  files: Map<SnapshotTable, Buffer>,
  {
    schema = "public",
    replace = false,
    log = () => {},
  }: {
    schema?: string;
    replace?: boolean;
    log?: (line: string) => void;
  } = {},
): Promise<Record<SnapshotTable, number>> {
  const byName = new Map(manifest.tables.map((t) => [t.name, t]));
  const counts = {} as Record<SnapshotTable, number>;
  await sql.begin(async (tx) => {
    if (replace) {
      const list = SNAPSHOT_TABLES.map((t) => `${q(schema)}.${q(t)}`).join(", ");
      await tx.unsafe(`TRUNCATE ${list} CASCADE`);
    }
    for (const name of SNAPSHOT_TABLES) {
      const table = byName.get(name)!;
      const lines = gunzipSync(files.get(name)!)
        .toString("utf8")
        .split("\n")
        .filter((l) => l.length > 0);
      if (lines.length !== table.rows) {
        throw new SnapshotError(
          `${table.file} has ${lines.length} rows, the manifest says ${table.rows}.`,
        );
      }
      const insert = insertBatchSql(name, table.columns, schema);
      for (let i = 0; i < lines.length; i += LOAD_BATCH) {
        await tx.unsafe(insert, [`[${lines.slice(i, i + LOAD_BATCH).join(",")}]`]);
      }
      const serial = SNAPSHOT_SERIALS[name];
      if (serial) {
        await tx.unsafe(
          `SELECT setval(pg_get_serial_sequence('${q(schema)}.${q(name)}', '${serial}'),
             GREATEST(coalesce(max(${q(serial)}), 0), 1), max(${q(serial)}) IS NOT NULL)
           FROM ${q(schema)}.${q(name)}`,
        );
      }
      log(`${name}: ${lines.length} rows`);
    }
    for (const name of SNAPSHOT_TABLES) {
      const [{ n }] = await tx.unsafe<[{ n: number }]>(
        `SELECT count(*)::int AS n FROM ${q(schema)}.${q(name)}`,
      );
      counts[name] = n;
    }
  });
  return counts;
}
