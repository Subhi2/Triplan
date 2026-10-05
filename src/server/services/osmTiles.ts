import {
  OsmServerBusyError,
  OsmTileTooBigError,
  type BBox,
  type OsmElement,
} from "../providers/osm";
import { padBBox, splitTile, tileSizeDeg, tilesFor, type OsmRegion } from "./osmRegions";

// The tile loop shared by the OpenStreetMap imports (places: scripts/import-osm.ts, service
// points: scripts/import-services.ts): one Overpass request at a time, tiles split when Overpass
// refuses them as too big, waits when the server is busy, and a stop when tiles keep failing.

const TILE_DEG = 1;
const BBOX_PAD_DEG = 0.02;
const MIN_TILE_DEG = 0.125;
const PAUSE_MS = 2_000; // between requests, to stay a light user of the public server
const BUSY_WAITS_S = [15, 30, 60, 120, 240];
/** After this many failed tiles in a row, Overpass is down for us: stop instead of grinding on. */
const MAX_FAILED_IN_A_ROW = 3;

/** Overpass looks down: the import stops (the rest can be re-run). */
export class ImportStopped extends Error {}

/** Counts failed tiles across regions, so an import stops when Overpass is down. */
export interface TileRunState {
  failedInARow: number;
}

export interface TileRunOptions {
  region: OsmRegion;
  state: TileRunState;
  fetchTile(bbox: BBox): Promise<OsmElement[]>;
  /** Handles one tile's elements; throwing marks the tile failed (retried on the next run). */
  onTile(
    elements: OsmElement[],
    tile: BBox,
    progress: { done: number; left: number },
  ): Promise<void>;
  log(line: string): void;
  sleep?: (ms: number) => Promise<void>;
  pauseMs?: number;
}

export interface TileRunResult {
  failed: BBox[];
  elements: number;
  tiles: number;
}

const fmt = (b: BBox) => `[${b.map((n) => n.toFixed(3)).join(", ")}]`;
const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** The tiles a region starts with. */
export function regionTiles(region: OsmRegion): BBox[] {
  return tilesFor(padBBox(region.bbox, BBOX_PAD_DEG), region.tileDeg ?? TILE_DEG);
}

/** Runs every tile of a region through `fetchTile` and `onTile`. Throws ImportStopped. */
export async function runRegionTiles(opts: TileRunOptions): Promise<TileRunResult> {
  const sleep = opts.sleep ?? defaultSleep;
  const pauseMs = opts.pauseMs ?? PAUSE_MS;
  const queue = regionTiles(opts.region);
  const failed: BBox[] = [];
  let elementsSeen = 0;
  let done = 0;

  while (queue.length > 0) {
    const tile = queue.shift()!;
    let elements: OsmElement[] | undefined;
    for (let attempt = 0; ; attempt++) {
      try {
        elements = await opts.fetchTile(tile);
        break;
      } catch (err) {
        const canSplit = tileSizeDeg(tile) / 2 >= MIN_TILE_DEG;
        // Under load Overpass refuses big queries with 504; a smaller tile may get in. An
        // unreachable server (status 0) is not helped by splitting.
        const refusedTooLong =
          err instanceof OsmServerBusyError && err.status === 504 && attempt >= BUSY_WAITS_S.length;
        if ((err instanceof OsmTileTooBigError || refusedTooLong) && canSplit) {
          opts.log(`  ${fmt(tile)} too big or refused (${(err as Error).message}); splitting`);
          queue.unshift(...splitTile(tile));
          break;
        }
        if (err instanceof OsmServerBusyError && attempt < BUSY_WAITS_S.length) {
          opts.log(
            `  ${fmt(tile)} server busy (${err.message}); waiting ${BUSY_WAITS_S[attempt]} s`,
          );
          await sleep(BUSY_WAITS_S[attempt]! * 1000);
          continue;
        }
        opts.log(`  ${fmt(tile)} FAILED: ${(err as Error).message}`);
        failed.push(tile);
        break;
      }
    }
    await sleep(pauseMs);
    if (!elements) {
      if (failed.at(-1) === tile && ++opts.state.failedInARow >= MAX_FAILED_IN_A_ROW) {
        throw new ImportStopped(
          `${opts.state.failedInARow} tiles failed in a row; Overpass looks down`,
        );
      }
      continue;
    }
    opts.state.failedInARow = 0;
    elementsSeen += elements.length;
    done++;
    try {
      await opts.onTile(elements, tile, { done, left: queue.length });
    } catch (err) {
      // One bad tile must not stop the region; it is retried on the next run.
      opts.log(`  ${fmt(tile)} FAILED to save: ${(err as Error).message}`);
      failed.push(tile);
    }
  }
  return { failed, elements: elementsSeen, tiles: done };
}

export { fmt as formatBBox };
