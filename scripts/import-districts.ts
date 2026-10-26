// Imports India's districts from OpenStreetMap with their LGD codes and outlines, for official
// alerts on a route (docs/02, "Alerts on the route").
//   pnpm db:import-districts                          (every state)
//   pnpm db:import-districts -- --region=karnataka    (region keys as for db:import-osm)
//   pnpm db:import-districts -- --dry-run             (count only, no database writes)
// One Overpass request per state for the district boundaries' tags, then Nominatim lookups for
// their outlines, 50 districts a request. Re-running is safe: rows are upserted on osm_id, and a
// state's districts not seen again are deleted.
import { parseArgs } from "node:util";
import { sql } from "drizzle-orm";
import { closeDb, getDb } from "../src/server/db";
import {
  getDistrictOutlines,
  getOsmPlacesProvider,
  OsmServerBusyError,
} from "../src/server/providers/osm";
import { LOOKUP_BATCH } from "../src/server/providers/osm/districtOutlines";
import {
  deleteStaleDistricts,
  districtFromElement,
  upsertDistricts,
  type DistrictCandidate,
} from "../src/server/services/districtImportService";
import { databaseNow } from "../src/server/services/osmImportService";
import {
  OSM_REGIONS,
  resolveRegionKeys,
  type OsmRegionKey,
} from "../src/server/services/osmRegions";

const time = () => new Date().toTimeString().slice(0, 8);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** Waits before asking Overpass again when every server is busy. */
const BUSY_WAITS_S = [30, 60, 120, 240];

async function districtElements(areaIso: string) {
  const provider = getOsmPlacesProvider();
  for (let attempt = 0; ; attempt++) {
    try {
      return await provider.fetchDistricts(areaIso);
    } catch (err) {
      if (!(err instanceof OsmServerBusyError) || attempt >= BUSY_WAITS_S.length) throw err;
      console.log(`  ${time()} busy (${err.message}); again in ${BUSY_WAITS_S[attempt]} s`);
      await sleep(BUSY_WAITS_S[attempt]! * 1000);
    }
  }
}

async function importRegion(key: OsmRegionKey, dryRun: boolean): Promise<boolean> {
  const region = OSM_REGIONS[key];
  const startedAt = dryRun ? "" : await databaseNow();
  const candidates = (await districtElements(region.iso))
    .map((e) => districtFromElement(e, key))
    .filter((c): c is DistrictCandidate => c !== null);
  const coded = candidates.filter((c) => c.lgdCode !== null).length;
  console.log(
    `${time()} ${region.name}: ${candidates.length} districts, ${coded} with an LGD code`,
  );
  if (dryRun || candidates.length === 0) return candidates.length > 0;

  let written = 0;
  let missing = 0;
  for (let i = 0; i < candidates.length; i += LOOKUP_BATCH) {
    const batch = candidates.slice(i, i + LOOKUP_BATCH);
    const outlines = await getDistrictOutlines(batch.map((c) => c.relationId));
    const rows = batch.flatMap((candidate) => {
      const outline = outlines.get(candidate.relationId);
      return outline ? [{ candidate, outline }] : [];
    });
    missing += batch.length - rows.length;
    written += await upsertDistricts(rows);
  }
  console.log(`  ${written} written${missing ? `, ${missing} without an outline` : ""}`);
  if (missing === 0) {
    const removed = await deleteStaleDistricts(key, startedAt);
    if (removed) console.log(`  ${removed} no longer in OpenStreetMap deleted`);
  }
  return missing === 0;
}

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((a) => a !== "--"),
    options: {
      region: { type: "string", default: "all" },
      skip: { type: "string", default: "" },
      "dry-run": { type: "boolean", default: false },
    },
  });
  const { keys, unknown } = resolveRegionKeys(values.region, values.skip);
  if (keys.length === 0 || unknown.length > 0) {
    if (unknown.length > 0) console.error(`Unknown regions: ${unknown.join(", ")}`);
    console.error(
      "Usage: pnpm db:import-districts -- [--region=<all|key[,key...]>] [--skip=…] [--dry-run]",
    );
    process.exitCode = 1;
    return;
  }
  const incomplete: OsmRegionKey[] = [];
  for (const key of keys) {
    if (!(await importRegion(key, values["dry-run"]))) incomplete.push(key);
  }
  if (!values["dry-run"]) {
    const [row] = await getDb().execute<{ n: number; coded: number; size: string }>(sql`
      SELECT count(*)::int AS n, count(lgd_code)::int AS coded,
             pg_size_pretty(pg_total_relation_size('district')) AS size
      FROM district`);
    console.log(
      `\n${time()} district: ${row?.n} rows (${row?.coded} with LGD codes), ${row?.size}`,
    );
  }
  if (incomplete.length > 0) {
    console.log(
      `Incomplete: ${incomplete.join(", ")}. Re-run with --region=${incomplete.join(",")}`,
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
