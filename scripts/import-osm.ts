// Imports places from OpenStreetMap (Overpass API) into the place table, state by state.
//   pnpm db:import-osm -- --region=all                         (every state and union territory)
//   pnpm db:import-osm -- --region=kerala,goa                  (region keys: src/server/services/osmRegions.ts)
//   pnpm db:import-osm -- --region=all --skip=karnataka,kerala (resume a run)
//   pnpm db:import-osm -- --region=goa --dry-run               (fetch and classify, no database writes)
// One Overpass request at a time, over the endpoints in OVERPASS_URLS (the next is tried when one
// is down); each region is split into tiles (1° by default), and a tile that is too big is split
// again. The run stops if tiles keep failing. Re-running is safe: places are upserted on osm_id.
import { parseArgs } from "node:util";
import { closeDb } from "../src/server/db";
import {
  getOsmPlacesProvider,
  OsmServerBusyError,
  OsmTileTooBigError,
  type BBox,
} from "../src/server/providers/osm";
import { classifyOsmElement, dedupeCandidates } from "../src/server/services/osmClassify";
import {
  closeStaleOsmPlaces,
  databaseNow,
  ensureCategories,
  upsertOsmPlaces,
} from "../src/server/services/osmImportService";
import {
  OSM_REGIONS,
  padBBox,
  resolveRegionKeys,
  splitTile,
  tileSizeDeg,
  tilesFor,
  type OsmRegion,
  type OsmRegionKey,
} from "../src/server/services/osmRegions";

const TILE_DEG = 1;
const BBOX_PAD_DEG = 0.02;
const MIN_TILE_DEG = 0.125;
const PAUSE_MS = 2_000; // between requests, to stay a light user of the public server
const BUSY_WAITS_S = [15, 30, 60, 120, 240];
/** After this many failed tiles in a row, Overpass is down for us: stop instead of grinding on. */
const MAX_FAILED_IN_A_ROW = 3;

class ImportStopped extends Error {}
let failedInARow = 0;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const fmt = (b: BBox) => `[${b.map((n) => n.toFixed(3)).join(", ")}]`;
const time = () => new Date().toTimeString().slice(0, 8);

function regionTiles(region: OsmRegion): BBox[] {
  return tilesFor(padBBox(region.bbox, BBOX_PAD_DEG), region.tileDeg ?? TILE_DEG);
}

/** Imports one region; returns false if any tile failed (the region should be re-run). */
async function importRegion(key: OsmRegionKey, dryRun: boolean): Promise<boolean> {
  const region: OsmRegion = OSM_REGIONS[key];
  const provider = getOsmPlacesProvider();
  const startedAt = dryRun ? "" : await databaseNow();
  const queue: BBox[] = regionTiles(region);
  const failed: BBox[] = [];
  const totals = { elements: 0, places: 0, inserted: 0, updated: 0, linked: 0, duplicates: 0 };
  const byCategory = new Map<string, number>();
  let done = 0;

  console.log(`\n${time()} ${region.name} (${region.iso}): ${queue.length} tiles`);
  while (queue.length > 0) {
    const tile = queue.shift()!;
    let elements;
    for (let attempt = 0; ; attempt++) {
      try {
        elements = await provider.fetchPlaces({ areaIso: region.iso, bbox: tile });
        break;
      } catch (err) {
        const canSplit = tileSizeDeg(tile) / 2 >= MIN_TILE_DEG;
        // Under load Overpass refuses big queries with 504; a smaller tile may get in. An
        // unreachable server (status 0) is not helped by splitting.
        const refusedTooLong =
          err instanceof OsmServerBusyError && err.status === 504 && attempt >= BUSY_WAITS_S.length;
        if ((err instanceof OsmTileTooBigError || refusedTooLong) && canSplit) {
          console.log(
            `  ${time()} ${fmt(tile)} too big or refused (${(err as Error).message}); splitting`,
          );
          queue.unshift(...splitTile(tile));
          break;
        }
        if (err instanceof OsmServerBusyError && attempt < BUSY_WAITS_S.length) {
          console.log(
            `  ${time()} ${fmt(tile)} server busy (${err.message}); waiting ${BUSY_WAITS_S[attempt]} s`,
          );
          await sleep(BUSY_WAITS_S[attempt]! * 1000);
          continue;
        }
        console.error(`  ${time()} ${fmt(tile)} FAILED: ${(err as Error).message}`);
        failed.push(tile);
        break;
      }
    }
    await sleep(PAUSE_MS);
    if (!elements) {
      if (failed.at(-1) === tile && ++failedInARow >= MAX_FAILED_IN_A_ROW) {
        throw new ImportStopped(`${failedInARow} tiles failed in a row; Overpass looks down`);
      }
      continue;
    }
    failedInARow = 0;

    const candidates = dedupeCandidates(elements.map(classifyOsmElement).filter((c) => c !== null));
    for (const c of candidates) byCategory.set(c.category, (byCategory.get(c.category) ?? 0) + 1);
    totals.elements += elements.length;
    totals.places += candidates.length;
    done++;

    if (dryRun) {
      console.log(`  ${fmt(tile)} ${elements.length} elements -> ${candidates.length} places`);
      continue;
    }
    let r;
    try {
      r = await upsertOsmPlaces(candidates, region.name);
    } catch (err) {
      // One bad tile must not stop the region; it is retried on the next run.
      console.error(`  ${time()} ${fmt(tile)} FAILED to save: ${(err as Error).message}`);
      failed.push(tile);
      continue;
    }
    totals.inserted += r.inserted;
    totals.updated += r.updated;
    totals.linked += r.linked;
    totals.duplicates += r.duplicates;
    console.log(
      `  ${time()} ${fmt(tile)} ${elements.length} elements -> ${candidates.length} places ` +
        `(+${r.inserted} new, ${r.updated} updated, ${r.linked} linked, ${r.duplicates} dup) ` +
        `[${done} tiles done, ${queue.length} left]`,
    );
  }

  const categories = [...byCategory].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ${n}`);
  console.log(`${time()} ${region.name}: ${totals.elements} elements -> ${totals.places} places`);
  console.log(`  by category: ${categories.join(", ")}`);
  // A state with nothing at all means the area lookup failed (e.g. a changed ISO code), not an
  // empty state. Treat it as failed so its existing places are not all marked closed.
  const empty = totals.elements === 0;
  if (empty) console.log(`  No places found: check the ISO3166-2 code ${region.iso} in OSM.`);
  if (!dryRun) {
    console.log(
      `  ${totals.inserted} inserted, ${totals.updated} updated, ${totals.linked} linked to ` +
        `curated places, ${totals.duplicates} skipped as duplicates of curated places`,
    );
    if (failed.length === 0 && !empty) {
      const closed = await closeStaleOsmPlaces(region.name, startedAt);
      console.log(`  ${closed} places no longer in OpenStreetMap marked closed`);
    } else if (failed.length > 0) {
      console.log(
        `  ${failed.length} tiles failed; re-run to retry. Stale places were not closed.`,
      );
    }
  }
  return failed.length === 0 && !empty;
}

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((a) => a !== "--"),
    options: {
      region: { type: "string" },
      skip: { type: "string", default: "" },
      "dry-run": { type: "boolean", default: false },
    },
  });
  const { keys, unknown } = resolveRegionKeys(values.region ?? "", values.skip);
  if (keys.length === 0 || unknown.length > 0) {
    if (unknown.length > 0) console.error(`Unknown regions: ${unknown.join(", ")}`);
    console.error(
      "Usage: pnpm db:import-osm -- --region=<all|key[,key...]> [--skip=key[,key...]] [--dry-run]\n" +
        `Regions: ${Object.keys(OSM_REGIONS).join(", ")}`,
    );
    process.exitCode = 1;
    return;
  }
  const dryRun = values["dry-run"];
  const tiles = keys.reduce((n, k) => n + regionTiles(OSM_REGIONS[k]).length, 0);
  console.log(`${time()} Importing ${keys.length} regions, ${tiles} tiles to start with.`);
  if (!dryRun) await ensureCategories();

  const incomplete: OsmRegionKey[] = [];
  for (const [i, key] of keys.entries()) {
    try {
      if (!(await importRegion(key, dryRun))) incomplete.push(key);
    } catch (err) {
      if (!(err instanceof ImportStopped)) throw err;
      console.error(`\n${time()} Stopped: ${err.message}.`);
      incomplete.push(...keys.slice(i));
      break;
    }
  }
  console.log(
    `\n${time()} Done: ${keys.length - incomplete.length} of ${keys.length} regions complete.`,
  );
  if (incomplete.length > 0) {
    console.log(`Re-run the rest with: pnpm db:import-osm -- --region=${incomplete.join(",")}`);
    process.exitCode = 1;
  }
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
