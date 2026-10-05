// Sets up a database in one command: runs the migrations, then loads our data snapshot (every
// place, photo credit, famous ride and service point) into the empty tables.
//   pnpm db:setup                                   (migrations + data/snapshot from this clone)
//   pnpm db:setup -- --url=https://example.org/snap (a snapshot published somewhere else)
//   pnpm db:setup -- --replace --yes                (empty the snapshot tables first; refused
//                                                    when trips or reviews exist)
//   pnpm db:setup -- --from-sources --regions=karnataka,kerala
//                                                   (rebuild from OpenStreetMap instead: hours)
// docs/02-architecture.md, "One-command data setup".
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import {
  DEPENDENT_TABLES,
  manifestProblems,
  manifestSchema,
  SNAPSHOT_TABLES,
  type SnapshotTable,
} from "../src/lib/snapshot";
import { migrationTags, MIGRATIONS_FOLDER } from "../src/server/db/journal";
import { loadSnapshot, readSnapshotFiles } from "../src/server/services/snapshotLoad";

const { values } = parseArgs({
  args: process.argv.slice(2).filter((a) => a !== "--"), // pnpm passes the "--" through
  options: {
    dir: { type: "string", default: "data/snapshot" },
    url: { type: "string" },
    replace: { type: "boolean", default: false },
    yes: { type: "boolean", default: false },
    "from-sources": { type: "boolean", default: false },
    regions: { type: "string", default: "all" },
  },
});

/** Where a clone without data/snapshot fetches it. */
const DEFAULT_URL = "https://raw.githubusercontent.com/Subhi2/Triplan/main/data/snapshot";

const time = () => new Date().toTimeString().slice(0, 8);

function run(script: string, ...args: string[]) {
  console.log(`\n${time()} pnpm ${script} ${args.join(" ")}`);
  const r = spawnSync("pnpm", [script, ...(args.length ? ["--", ...args] : [])], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (r.status !== 0) throw new Error(`pnpm ${script} failed; fix it and run again.`);
}

/** The slow way: seed, then import from OpenStreetMap and Wikimedia, then route the rides. */
function fromSources(regions: string) {
  run("db:seed");
  run("db:import-osm", `--region=${regions}`);
  run("db:import-photos");
  run("db:seed-rides");
  run("db:import-services", `--region=${regions}`);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local.");
  const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
  try {
    console.log(`${time()} Running migrations`);
    await migrate(drizzle(sql), { migrationsFolder: MIGRATIONS_FOLDER });

    if (values["from-sources"]) {
      await sql.end();
      fromSources(values.regions);
      console.log(`\n${time()} Done.`);
      return;
    }

    // The snapshot: this clone's copy, or one published at a URL.
    const base = values.url ?? (existsSync(join(values.dir, "manifest.json")) ? null : DEFAULT_URL);
    const read = async (file: string): Promise<Buffer> => {
      if (!base) return readFile(join(values.dir, file));
      const res = await fetch(`${base.replace(/\/$/, "")}/${file}`);
      if (!res.ok) throw new Error(`Could not download ${file}: HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    };
    console.log(`${time()} Snapshot from ${base ?? values.dir}`);
    const manifest = manifestSchema.parse(
      JSON.parse((await read("manifest.json")).toString("utf8")),
    );

    const columns: Partial<Record<SnapshotTable, string[]>> = {};
    for (const t of SNAPSHOT_TABLES) {
      columns[t] = (
        await sql<{ column_name: string }[]>`
          SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = ${t}`
      ).map((r) => r.column_name);
    }
    const problems = manifestProblems(manifest, await migrationTags(), columns);
    if (problems.length > 0) throw new Error(problems.join("\n"));

    // Only into empty tables, unless asked to replace (and nothing depends on the rows).
    const count = async (t: string) =>
      (await sql.unsafe<[{ n: number }]>(`SELECT count(*)::int AS n FROM "${t}"`))[0].n;
    const filled: string[] = [];
    for (const t of SNAPSHOT_TABLES) {
      const n = await count(t);
      if (n > 0) filled.push(`${t} (${n})`);
    }
    if (filled.length > 0 && !values.replace) {
      throw new Error(
        `These tables already have rows: ${filled.join(", ")}.\n` +
          "Use a new database, or empty them with: pnpm db:setup -- --replace --yes",
      );
    }
    if (filled.length > 0 && !values.yes) {
      throw new Error(
        "--replace deletes every place, ride and service point: add --yes to confirm.",
      );
    }
    if (values.replace) {
      for (const t of DEPENDENT_TABLES) {
        if ((await count(t)) > 0) {
          throw new Error(`Refusing to replace: ${t} has rows, so this database is in use.`);
        }
      }
    }

    console.log(`${time()} Checking ${manifest.tables.length} files (made ${manifest.createdAt})`);
    const files = await readSnapshotFiles(manifest, read);
    console.log(`${time()} Loading`);
    const counts = await loadSnapshot(sql, manifest, files, {
      replace: values.replace,
      log: (line) => console.log(`  ${line}`),
    });
    await sql.unsafe(`ANALYZE ${SNAPSHOT_TABLES.map((t) => `"${t}"`).join(", ")}`);
    const wrong = manifest.tables.filter((t) => counts[t.name] !== t.rows);
    if (wrong.length > 0) {
      throw new Error(
        `Row counts differ from the manifest: ${wrong.map((t) => t.name).join(", ")}`,
      );
    }
    console.log(
      `\n${time()} Done: ${counts.place} places, ${counts.media} photos, ${counts.ride} rides, ` +
        `${counts.service_point} service points.\nData: ${manifest.licence}`,
    );
  } finally {
    await sql.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
