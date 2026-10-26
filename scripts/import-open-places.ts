// Imports fuel, food and coffee from Overture Places into open_place, for the break planner and
// the fuel gap (docs/02, "Open places from Overture").
//   pnpm db:import-open-places -- --region=karnataka            (region keys as for db:import-osm)
//   pnpm db:import-open-places -- --region=all --skip=karnataka (resume a run)
//   pnpm db:import-open-places -- --region=goa --dry-run        (count only, no database writes)
//   pnpm db:import-open-places -- --region=all --release=2026-10-21.0
// Reads each state's box from Overture's public files with DuckDB, keeps the records inside the
// state's districts, and skips the ones we already have. Re-running is safe: rows are upserted on
// Overture's id, and a state's rows not written again are deleted after its run.
import { parseArgs } from "node:util";
import { sql } from "drizzle-orm";
import { closeDb, getDb } from "../src/server/db";
import { getOpenPlacesProvider } from "../src/server/providers/openPlaces";
import {
  classifyOpenPlace,
  isOpenPlaceCandidate,
  OPEN_PLACE_BASIC_CATEGORIES,
} from "../src/server/services/openPlaceClassify";
import { deleteStaleOpenPlaces, upsertOpenPlaces } from "../src/server/services/openPlaceService";
import { databaseNow } from "../src/server/services/osmImportService";
import { OSM_REGIONS, resolveRegionKeys } from "../src/server/services/osmRegions";

const time = () => new Date().toTimeString().slice(0, 8);

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((a) => a !== "--"),
    options: {
      region: { type: "string" },
      skip: { type: "string", default: "" },
      release: { type: "string" },
      "dry-run": { type: "boolean", default: false },
    },
  });
  const { keys, unknown } = resolveRegionKeys(values.region ?? "", values.skip);
  if (keys.length === 0 || unknown.length > 0) {
    if (unknown.length > 0) console.error(`Unknown regions: ${unknown.join(", ")}`);
    console.error(
      "Usage: pnpm db:import-open-places -- --region=<all|key[,key...]> [--skip=…] " +
        "[--release=YYYY-MM-DD.N] [--dry-run]",
    );
    process.exitCode = 1;
    return;
  }
  const dryRun = values["dry-run"];
  const provider = await getOpenPlacesProvider(values.release);
  console.log(`${time()} Overture Places ${provider.release}: ${keys.length} regions.`);

  const failed: string[] = [];
  try {
    for (const key of keys) {
      const region = OSM_REGIONS[key];
      try {
        const startedAt = dryRun ? "" : await databaseNow();
        const records = await provider.placesInBox(region.bbox, OPEN_PLACE_BASIC_CATEGORIES);
        const classified = records.map((r) => classifyOpenPlace(r));
        const candidates = classified.filter(isOpenPlaceCandidate);
        const skips = new Map<string, number>();
        for (const c of classified) {
          if (!isOpenPlaceCandidate(c)) skips.set(c.skip, (skips.get(c.skip) ?? 0) + 1);
        }
        const skipped = [...skips].map(([k, n]) => `${k} ${n}`).join(", ") || "none";
        console.log(
          `\n${time()} ${region.name}: ${records.length} in the box, ` +
            `${candidates.length} pass; skipped ${skipped}`,
        );
        if (dryRun) continue;
        const c = await upsertOpenPlaces(candidates, key, provider.release);
        const removed = await deleteStaleOpenPlaces(key, startedAt);
        console.log(
          `  ${c.outside} outside the state, ${c.ours} already ours, ${c.capped} over the cell ` +
            `cap; ${c.written} written, ${removed} no longer in Overture deleted`,
        );
      } catch (err) {
        console.error(`  ${time()} ${region.name} failed:`, err);
        failed.push(key);
      }
    }
  } finally {
    provider.close();
  }

  if (!dryRun) {
    const rows = await getDb().execute<{ category: string; n: number }>(sql`
      SELECT category, count(*)::int AS n FROM open_place GROUP BY 1 ORDER BY 1`);
    const [size] = await getDb().execute<{ size: string }>(sql`
      SELECT pg_size_pretty(pg_total_relation_size('open_place')) AS size`);
    console.log(
      `\n${time()} open_place: ${rows.map((r) => `${r.category} ${r.n}`).join(", ")}; ${size?.size}`,
    );
  }
  console.log(`${time()} Done: ${keys.length - failed.length} of ${keys.length} regions.`);
  if (failed.length > 0) {
    console.log(`Re-run the rest with: pnpm db:import-open-places -- --region=${failed.join(",")}`);
    process.exitCode = 1;
  }
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
