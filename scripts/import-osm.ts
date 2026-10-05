// Imports places from OpenStreetMap (Overpass API) into the place table, state by state.
//   pnpm db:import-osm -- --region=all                         (every state and union territory)
//   pnpm db:import-osm -- --region=kerala,goa                  (region keys: src/server/services/osmRegions.ts)
//   pnpm db:import-osm -- --region=all --skip=karnataka,kerala (resume a run)
//   pnpm db:import-osm -- --region=goa --dry-run               (fetch and classify, no database writes)
// One Overpass request at a time, over the endpoints in OVERPASS_URLS (the next is tried when one
// is down); each region is split into tiles (1° by default), and a tile that is too big is split
// again (src/server/services/osmTiles.ts). The run stops if tiles keep failing. Re-running is
// safe: places are upserted on osm_id.
import { parseArgs } from "node:util";
import { closeDb } from "../src/server/db";
import { getOsmPlacesProvider } from "../src/server/providers/osm";
import { classifyOsmElement, dedupeCandidates } from "../src/server/services/osmClassify";
import {
  closeStaleOsmPlaces,
  databaseNow,
  ensureCategories,
  upsertOsmPlaces,
} from "../src/server/services/osmImportService";
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

const time = () => new Date().toTimeString().slice(0, 8);
const state: TileRunState = { failedInARow: 0 };

/** Imports one region; returns false if any tile failed (the region should be re-run). */
async function importRegion(key: OsmRegionKey, dryRun: boolean): Promise<boolean> {
  const region = OSM_REGIONS[key];
  const provider = getOsmPlacesProvider();
  const startedAt = dryRun ? "" : await databaseNow();
  const totals = { places: 0, inserted: 0, updated: 0, linked: 0, duplicates: 0 };
  const byCategory = new Map<string, number>();

  console.log(`\n${time()} ${region.name} (${region.iso}): ${regionTiles(region).length} tiles`);
  const { failed, elements } = await runRegionTiles({
    region,
    state,
    fetchTile: (bbox) => provider.fetchPlaces({ areaIso: region.iso, bbox }),
    log: (line) => console.log(`  ${time()}${line}`),
    async onTile(tileElements, tile, { done, left }) {
      const candidates = dedupeCandidates(
        tileElements.map(classifyOsmElement).filter((c) => c !== null),
      );
      for (const c of candidates) byCategory.set(c.category, (byCategory.get(c.category) ?? 0) + 1);
      totals.places += candidates.length;
      if (dryRun) {
        console.log(
          `  ${fmt(tile)} ${tileElements.length} elements -> ${candidates.length} places`,
        );
        return;
      }
      const r = await upsertOsmPlaces(candidates, region.name);
      totals.inserted += r.inserted;
      totals.updated += r.updated;
      totals.linked += r.linked;
      totals.duplicates += r.duplicates;
      console.log(
        `  ${time()} ${fmt(tile)} ${tileElements.length} elements -> ${candidates.length} places ` +
          `(+${r.inserted} new, ${r.updated} updated, ${r.linked} linked, ${r.duplicates} dup) ` +
          `[${done} tiles done, ${left} left]`,
      );
    },
  });

  const categories = [...byCategory].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ${n}`);
  console.log(`${time()} ${region.name}: ${elements} elements -> ${totals.places} places`);
  console.log(`  by category: ${categories.join(", ")}`);
  // A state with nothing at all means the area lookup failed (e.g. a changed ISO code), not an
  // empty state. Treat it as failed so its existing places are not all marked closed.
  const empty = elements === 0;
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
