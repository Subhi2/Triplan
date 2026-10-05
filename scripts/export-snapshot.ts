// Writes our public tables to data/snapshot as gzipped JSON lines with a manifest, for
// `pnpm db:setup` (docs/02-architecture.md, "One-command data setup").
//   pnpm db:export-snapshot                      (into data/snapshot)
//   pnpm db:export-snapshot -- --out=/tmp/snap   (somewhere else)
// Run it against the live database after an import, then commit data/snapshot. Read only: one
// repeatable-read transaction, so every file comes from the same moment. Never includes trips,
// reviews, accounts, usage, caches or Google place ids (src/lib/snapshot.ts).
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { gzipSync } from "node:zlib";
import postgres from "postgres";
import {
  exportRowsSql,
  SNAPSHOT_FORMAT,
  SNAPSHOT_LICENCE,
  SNAPSHOT_TABLES,
  type SnapshotManifest,
} from "../src/lib/snapshot";
import { migrationTags } from "../src/server/db/journal";

const { values } = parseArgs({
  args: process.argv.slice(2).filter((a) => a !== "--"), // pnpm passes the "--" through
  options: { out: { type: "string", default: "data/snapshot" } },
});

/** Rows fetched per cursor step. */
const CURSOR_ROWS = 2_000;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local.");
  const out = values.out;
  await mkdir(out, { recursive: true });
  const sql = postgres(url, { prepare: false, max: 1 });
  const migration = (await migrationTags()).at(-1)!;
  const tables: SnapshotManifest["tables"] = [];

  try {
    await sql.begin("isolation level repeatable read read only", async (tx) => {
      for (const name of SNAPSHOT_TABLES) {
        const cols = await tx<{ column_name: string; udt_name: string }[]>`
          SELECT column_name, udt_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = ${name} AND is_generated = 'NEVER'
          ORDER BY ordinal_position`;
        const columns = cols.map((c) => c.column_name);
        const spatial = cols
          .filter((c) => c.udt_name === "geography" || c.udt_name === "geometry")
          .map((c) => c.column_name);
        const lines: string[] = [];
        const cursor = tx.unsafe<{ line: string }[]>(exportRowsSql(name, columns, spatial));
        for await (const rows of cursor.cursor(CURSOR_ROWS)) {
          for (const r of rows) lines.push(r.line);
        }
        // gzip leaves the time out of its header, so unchanged data gives the same file.
        const gz = gzipSync(lines.length > 0 ? `${lines.join("\n")}\n` : "", { level: 9 });
        const file = `${name}.ndjson.gz`;
        await writeFile(join(out, file), gz);
        const sha256 = createHash("sha256").update(gz).digest("hex");
        tables.push({ name, file, columns, rows: lines.length, bytes: gz.length, sha256 });
        console.log(`${name}: ${lines.length} rows, ${(gz.length / 1e6).toFixed(2)} MB`);
      }
    });
  } finally {
    await sql.end();
  }

  const manifest: SnapshotManifest = {
    format: SNAPSHOT_FORMAT,
    createdAt: new Date().toISOString(),
    migration,
    licence: SNAPSHOT_LICENCE,
    tables,
  };
  await writeFile(join(out, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  const total = tables.reduce((n, t) => n + t.bytes, 0);
  console.log(`Wrote ${tables.length} tables (${(total / 1e6).toFixed(1)} MB) to ${out}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
