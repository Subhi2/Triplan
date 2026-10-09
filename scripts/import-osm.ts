// Imports places from OpenStreetMap (Overpass API) into the place table, state by state.
//   pnpm db:import-osm -- --region=all                         (every state and union territory)
//   pnpm db:import-osm -- --region=kerala,goa                  (region keys: src/server/services/osmRegions.ts)
//   pnpm db:import-osm -- --region=all --skip=karnataka,kerala (leave regions out)
//   pnpm db:import-osm -- --region=all --resume                (go on after a stopped run)
//   pnpm db:import-osm -- --region=odisha --tile-deg=0.5       (smaller first tiles: dense states)
//   pnpm db:import-osm -- --region=rajasthan --part=2/3        (one of 3 runs sharing a state)
//   pnpm db:import-osm -- --region=goa --dry-run               (fetch and classify, no database writes)
//   pnpm db:import-osm -- --region=goa --resume --force        (close more than 3% of a state)
// One Overpass request at a time, over the endpoints in OVERPASS_URLS (the next is tried when one
// is down); each region is split into tiles (1° by default), and a tile that is too big is split
// again (src/server/services/osmTiles.ts). The run stops if tiles keep failing. Re-running is
// safe: places are upserted on osm_id. Each region's saved and split tiles are kept in
// .import-progress/places-<region>.json; --resume skips those tiles and the regions that finished.
// Tiles that do not touch the state's outline (from Nominatim, kept in .import-progress) are
// skipped: a state's box is often half another state.
// When a region is complete, places it did not see are closed only if the OSM API says they are
// deleted or no longer a place we import, and at most 3% of the state's places without --force
// (src/server/services/osmClose.ts). The full list goes to .import-progress/close-<region>.json.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { closeDb } from "../src/server/db";
import {
  getOsmCurrentProvider,
  getOsmPlacesProvider,
  getRegionOutline,
  type BBox,
  type RegionOutline,
} from "../src/server/providers/osm";
import { classifyOsmElement, dedupeCandidates } from "../src/server/services/osmClassify";
import {
  mergeProgress,
  PROGRESS_DIR,
  progressPath,
  readProgress,
  writeProgress,
} from "../src/server/services/importProgress";
import {
  closeStaleOsmPlaces,
  databaseNow,
  ensureCategories,
  upsertOsmPlaces,
} from "../src/server/services/osmImportService";
import {
  OSM_REGIONS,
  outlineFitsRegion,
  resolveRegionKeys,
  tileTouchesOutline,
  type OsmRegionKey,
} from "../src/server/services/osmRegions";
import {
  formatBBox as fmt,
  ImportStopped,
  pendingTiles,
  regionTiles,
  runRegionTiles,
  type TilePart,
  type TileRunState,
} from "../src/server/services/osmTiles";

const time = () => new Date().toTimeString().slice(0, 8);
/** About 5 km around the outline: covers its simplification (about 500 m) with room to spare. */
const OUTLINE_MARGIN_DEG = 0.05;

/** The state's outline, cached next to the resume files; null when Nominatim has none. */
async function regionOutline(key: OsmRegionKey, stateName: string): Promise<RegionOutline | null> {
  const file = join(PROGRESS_DIR, `outline-${key}.json`);
  try {
    return JSON.parse(readFileSync(file, "utf8")) as RegionOutline;
  } catch {
    // Not cached yet.
  }
  try {
    const outline = await getRegionOutline(stateName);
    if (outline) writeFileSync(file, JSON.stringify(outline));
    return outline;
  } catch (err) {
    console.log(`  outline lookup failed: ${(err as Error).message}`);
    return null;
  }
}
const state: TileRunState = { failedInARow: 0 };

interface ImportOptions {
  dryRun: boolean;
  resume: boolean;
  force: boolean;
  tileDeg: number | undefined;
  part: TilePart | undefined;
}

/**
 * Imports one region (or this run's part of it); returns false if any tile failed (the region
 * should be re-run).
 */
async function importRegion(
  key: OsmRegionKey,
  { dryRun, resume, force, tileDeg, part }: ImportOptions,
): Promise<boolean> {
  const provider = getOsmPlacesProvider();
  const file = progressPath("places", key);
  const saved = resume && !dryRun ? readProgress(file) : null;
  // Dense states time out at their usual 1° or 2° tiles (100 s each) before the halves get in.
  const startDeg = saved ? saved.tileDeg : tileDeg;
  const region = startDeg ? { ...OSM_REGIONS[key], tileDeg: startDeg } : OSM_REGIONS[key];
  if (saved?.complete) {
    console.log(`\n${time()} ${region.name}: complete in the run started ${saved.startedAt}`);
    return true;
  }
  // A resumed region keeps its first start time: places saved before the stop are still "seen".
  const startedAt = dryRun ? "" : (saved?.startedAt ?? (await databaseNow()));
  const progress = {
    startedAt,
    complete: false,
    elements: saved?.elements ?? 0,
    ...(startDeg ? { tileDeg: startDeg } : {}),
    done: [...(saved?.done ?? [])],
    split: [...(saved?.split ?? [])],
  };
  // A fresh run replaces the file; after that, saves merge with it (other parts write it too).
  let fresh = !saved;
  const save = () => {
    if (dryRun) return;
    if (fresh) writeProgress(file, progress);
    else mergeProgress(file, progress);
    fresh = false;
  };
  save();
  const totals = { places: 0, inserted: 0, updated: 0, linked: 0, duplicates: 0 };
  const byCategory = new Map<string, number>();

  console.log(`\n${time()} ${region.name} (${region.iso}): ${regionTiles(region).length} tiles`);
  if (saved) {
    console.log(`  resuming the run started ${saved.startedAt}: ${saved.done.length} tiles saved`);
  }
  if (part) console.log(`  part ${part.index + 1} of ${part.count}`);
  const found = await regionOutline(key, region.name);
  const outline = found && outlineFitsRegion(found, region.bbox) ? found : null;
  if (!outline) console.log("  no usable outline from Nominatim: every tile is fetched");
  const walk = {
    ...(outline
      ? { keepTile: (tile: BBox) => tileTouchesOutline(tile, outline, OUTLINE_MARGIN_DEG) }
      : {}),
    // A resumed dense state splits its remaining big tiles down to --tile-deg before asking.
    ...((tileDeg ?? startDeg) ? { splitAboveDeg: (tileDeg ?? startDeg)! } : {}),
  };
  const { failed, outside } = await runRegionTiles({
    region,
    state,
    fetchTile: (bbox) => provider.fetchPlaces({ areaIso: region.iso, bbox }),
    log: (line) => console.log(`  ${time()}${line}`),
    ...(saved ? { resume: { done: new Set(saved.done), split: new Set(saved.split) } } : {}),
    ...walk,
    ...(part ? { part } : {}),
    onSplit(tile) {
      progress.split.push(fmt(tile));
      save();
    },
    async onTile(tileElements, tile, { done, left }) {
      const candidates = dedupeCandidates(
        tileElements.map(classifyOsmElement).filter((c) => c !== null),
      );
      for (const c of candidates) byCategory.set(c.category, (byCategory.get(c.category) ?? 0) + 1);
      totals.places += candidates.length;
      progress.elements += tileElements.length;
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
      progress.done.push(fmt(tile));
      save();
      console.log(
        `  ${time()} ${fmt(tile)} ${tileElements.length} elements -> ${candidates.length} places ` +
          `(+${r.inserted} new, ${r.updated} updated, ${r.linked} linked, ${r.duplicates} dup) ` +
          `[${done} tiles done, ${left} left]`,
      );
    },
  });

  const categories = [...byCategory].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ${n}`);
  // What every run of the region saved so far (the parts write the same file).
  const all = dryRun ? progress : (readProgress(file) ?? progress);
  const pending = dryRun
    ? 0
    : pendingTiles(region, {
        ...walk,
        resume: { done: new Set(all.done), split: new Set(all.split) },
      }).length;
  const { elements } = all;
  console.log(`${time()} ${region.name}: ${elements} elements -> ${totals.places} places`);
  if (outside > 0) console.log(`  ${outside} tiles outside the state skipped`);
  console.log(`  by category: ${categories.join(", ")}`);
  // A state with nothing at all means the area lookup failed (e.g. a changed ISO code), not an
  // empty state. Treat it as failed so its existing places are not all marked closed.
  const empty = elements === 0;
  if (empty) console.log(`  No places found: check the ISO3166-2 code ${region.iso} in OSM.`);
  let closeRefused = false;
  if (!dryRun) {
    console.log(
      `  ${totals.inserted} inserted, ${totals.updated} updated, ${totals.linked} linked to ` +
        `curated places, ${totals.duplicates} skipped as duplicates of curated places`,
    );
    if (failed.length === 0 && pending === 0 && !empty) {
      const plan = await closeStaleOsmPlaces(region.name, all.startedAt, {
        osm: getOsmCurrentProvider(),
        force,
      });
      const list = {
        close: plan.close.map((c) => ({ ...c.place, reason: c.reason })),
        stillThere: plan.stillThere,
        unchecked: plan.unchecked,
      };
      writeFileSync(join(PROGRESS_DIR, `close-${key}.json`), JSON.stringify(list, null, 1));
      console.log(
        `  ${plan.candidates} places not seen: ${plan.close.length} gone from OpenStreetMap, ` +
          `${plan.stillThere.length} still there and ${plan.unchecked.length} unchecked (kept open)`,
      );
      for (const c of plan.close.slice(0, 15)) {
        console.log(`    ${c.reason} ${c.place.osmId} ${c.place.name} (${c.place.category})`);
      }
      if (plan.refused) {
        closeRefused = true;
        console.log(
          `  NOT closed: more than ${plan.limit} places. Check close-${key}.json, then close them ` +
            `with: pnpm db:import-osm -- --region=${key} --resume --force`,
        );
      } else {
        console.log(`  ${plan.close.length} places marked closed`);
        progress.complete = true;
        save();
      }
    } else if (failed.length > 0) {
      console.log(
        `  ${failed.length} tiles failed; re-run to retry. Stale places were not closed.`,
      );
    } else if (pending > 0) {
      console.log(`  ${pending} tiles left to the other parts; the last one closes stale places`);
    }
  }
  // A part is done when its own tiles are; the region is complete when no tile is left.
  return failed.length === 0 && !empty && !closeRefused && (pending === 0 || part !== undefined);
}

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((a) => a !== "--"),
    options: {
      region: { type: "string" },
      skip: { type: "string", default: "" },
      resume: { type: "boolean", default: false },
      "tile-deg": { type: "string" },
      part: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      force: { type: "boolean", default: false },
    },
  });
  const { keys, unknown } = resolveRegionKeys(values.region ?? "", values.skip);
  if (keys.length === 0 || unknown.length > 0) {
    if (unknown.length > 0) console.error(`Unknown regions: ${unknown.join(", ")}`);
    console.error(
      "Usage: pnpm db:import-osm -- --region=<all|key[,key...]> [--skip=key[,key...]] [--resume]" +
        " [--tile-deg=0.5] [--part=1/3] [--dry-run] [--force]\n" +
        `Regions: ${Object.keys(OSM_REGIONS).join(", ")}`,
    );
    process.exitCode = 1;
    return;
  }
  const dryRun = values["dry-run"];
  const tileDeg = values["tile-deg"] ? Number(values["tile-deg"]) : undefined;
  if (tileDeg !== undefined && !(tileDeg >= 0.125 && tileDeg <= 8)) {
    console.error("--tile-deg must be between 0.125 and 8");
    process.exitCode = 1;
    return;
  }
  const partMatch = values.part ? /^(\d+)\/(\d+)$/.exec(values.part) : null;
  const part: TilePart | undefined = partMatch
    ? { index: Number(partMatch[1]) - 1, count: Number(partMatch[2]) }
    : undefined;
  if (values.part && (!part || part.index < 0 || part.index >= part.count || part.count > 16)) {
    console.error("--part must look like 2/3 (part 2 of 3, at most 16 parts)");
    process.exitCode = 1;
    return;
  }
  // Parts share the region's resume file, so they always resume.
  const resume = values.resume || part !== undefined;
  const tiles = keys.reduce((n, k) => n + regionTiles(OSM_REGIONS[k]).length, 0);
  console.log(`${time()} Importing ${keys.length} regions, ${tiles} tiles to start with.`);
  if (!dryRun) await ensureCategories();

  const incomplete: OsmRegionKey[] = [];
  for (const [i, key] of keys.entries()) {
    try {
      const options = { dryRun, resume, force: values.force, tileDeg, part };
      if (!(await importRegion(key, options))) incomplete.push(key);
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
    console.log(
      `Re-run the rest with: pnpm db:import-osm -- --region=${incomplete.join(",")} --resume`,
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
