// Imports service points from OpenStreetMap: hospitals, police, ATMs, tyre and repair shops and
// stays, for safety stops and overnight stays (docs/02, "Safety stops").
//   pnpm db:import-services -- --region=karnataka            (region keys as for db:import-osm)
//   pnpm db:import-services -- --region=all --skip=karnataka (resume a run)
//   pnpm db:import-services -- --region=goa --dry-run        (count only, no database writes)
//   pnpm db:import-services -- --region=goa --kinds=hospital,police
// Same tile loop as the places import: one Overpass request at a time. Re-running is safe: rows
// are upserted on osm_id, and a region's rows not seen again are deleted after a full run.
import { parseArgs } from "node:util";
import { closeDb, getDb } from "../src/server/db";
import { getOsmPlacesProvider } from "../src/server/providers/osm";
import { databaseNow } from "../src/server/services/osmImportService";
import {
  OSM_REGIONS,
  resolveRegionKeys,
  type OsmRegionKey,
} from "../src/server/services/osmRegions";
import {
  formatBBox as fmt,
  ImportStopped,
  regionTiles,
  runRegionTiles,
  type TileRunState,
} from "../src/server/services/osmTiles";
import {
  classifyService,
  SERVICE_KINDS,
  type ServiceKind,
} from "../src/server/services/serviceClassify";
import {
  deleteStaleServicePoints,
  upsertServicePoints,
} from "../src/server/services/servicePointService";
import { sql } from "drizzle-orm";

const time = () => new Date().toTimeString().slice(0, 8);
const state: TileRunState = { failedInARow: 0 };

async function importRegion(
  key: OsmRegionKey,
  kinds: Set<ServiceKind>,
  dryRun: boolean,
): Promise<boolean> {
  const region = OSM_REGIONS[key];
  const provider = getOsmPlacesProvider();
  const startedAt = dryRun ? "" : await databaseNow();
  const byKind = new Map<string, number>();
  let written = 0;

  console.log(`\n${time()} ${region.name} (${region.iso}): ${regionTiles(region).length} tiles`);
  const { failed, elements } = await runRegionTiles({
    region,
    state,
    fetchTile: (bbox) => provider.fetchServices({ areaIso: region.iso, bbox }),
    log: (line) => console.log(`  ${time()}${line}`),
    async onTile(tileElements, tile, { done, left }) {
      const points = tileElements
        .map(classifyService)
        .filter((p) => p !== null && kinds.has(p.kind))
        .map((p) => p!);
      for (const p of points) byKind.set(p.kind, (byKind.get(p.kind) ?? 0) + 1);
      if (!dryRun) written += await upsertServicePoints(points, region.name);
      console.log(
        `  ${time()} ${fmt(tile)} ${tileElements.length} elements -> ${points.length} points ` +
          `[${done} tiles done, ${left} left]`,
      );
    },
  });

  const summary = [...byKind].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`);
  console.log(`${time()} ${region.name}: ${elements} elements; ${summary.join(", ") || "none"}`);
  const empty = elements === 0;
  if (!dryRun) {
    console.log(`  ${written} written`);
    // Only after a full run of every kind, so a partial run never deletes good rows.
    if (failed.length === 0 && !empty && kinds.size === SERVICE_KINDS.length) {
      const removed = await deleteStaleServicePoints(region.name, startedAt);
      console.log(`  ${removed} no longer in OpenStreetMap deleted`);
    }
  }
  if (failed.length > 0) console.log(`  ${failed.length} tiles failed; re-run to retry.`);
  return failed.length === 0 && !empty;
}

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((a) => a !== "--"),
    options: {
      region: { type: "string" },
      skip: { type: "string", default: "" },
      kinds: { type: "string" },
      "dry-run": { type: "boolean", default: false },
    },
  });
  const { keys, unknown } = resolveRegionKeys(values.region ?? "", values.skip);
  const kinds = new Set(
    (values.kinds?.split(",") ?? [...SERVICE_KINDS]).filter((k): k is ServiceKind =>
      (SERVICE_KINDS as readonly string[]).includes(k),
    ),
  );
  if (keys.length === 0 || unknown.length > 0 || kinds.size === 0) {
    if (unknown.length > 0) console.error(`Unknown regions: ${unknown.join(", ")}`);
    console.error(
      "Usage: pnpm db:import-services -- --region=<all|key[,key...]> [--skip=…] " +
        `[--kinds=${SERVICE_KINDS.join(",")}] [--dry-run]`,
    );
    process.exitCode = 1;
    return;
  }
  const dryRun = values["dry-run"];
  console.log(`${time()} Importing ${[...kinds].join(", ")} for ${keys.length} regions.`);

  const incomplete: OsmRegionKey[] = [];
  for (const [i, key] of keys.entries()) {
    try {
      if (!(await importRegion(key, kinds, dryRun))) incomplete.push(key);
    } catch (err) {
      if (!(err instanceof ImportStopped)) throw err;
      console.error(`\n${time()} Stopped: ${err.message}.`);
      incomplete.push(...keys.slice(i));
      break;
    }
  }
  if (!dryRun) {
    const [row] = await getDb().execute<{ n: number; size: string }>(sql`
      SELECT count(*)::int AS n, pg_size_pretty(pg_total_relation_size('service_point')) AS size
      FROM service_point`);
    console.log(`\n${time()} service_point: ${row?.n} rows, ${row?.size}`);
  }
  console.log(
    `${time()} Done: ${keys.length - incomplete.length} of ${keys.length} regions complete.`,
  );
  if (incomplete.length > 0) {
    console.log(
      `Re-run the rest with: pnpm db:import-services -- --region=${incomplete.join(",")}`,
    );
    process.exitCode = 1;
  }
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
