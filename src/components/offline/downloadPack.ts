"use client";

import { PMTiles } from "pmtiles";
import type { LngLat } from "@/lib/geo";
import {
  PACK_CONCURRENCY,
  PACK_FONTSTACKS,
  PACK_GLYPH_RANGES,
  PACK_MAX_BYTES,
  packCacheName,
  packGlyphKey,
  packTileKey,
  planPack,
} from "@/lib/offlinePack";

/** Our own PMTiles file of India (CLAUDE.md, "Choosing new features"); empty = no packs. */
export const OFFLINE_TILES_URL = process.env.NEXT_PUBLIC_OFFLINE_TILES_URL ?? "";

export class PackError extends Error {}

/**
 * Downloads a route's corridor tiles (zoom 6–13, at most 3,000 tiles and 50 MB, 4 at a time)
 * from our own PMTiles file into the pack's cache, with the glyphs for its labels from the same
 * folder (fonts/<fontstack>/<range>.pbf). On any failure the half-saved cache is removed.
 */
export async function downloadPack({
  routeId,
  line,
  onProgress,
  signal,
}: {
  routeId: string;
  line: LngLat[];
  onProgress: (done: number, total: number) => void;
  signal?: AbortSignal;
}): Promise<{ tiles: number; bytes: number; maxZoom: number }> {
  if (!OFFLINE_TILES_URL) throw new PackError("Offline maps are not set up.");
  const plan = planPack(line);
  if (!plan) throw new PackError("This route is too long for one pack: save it a day at a time.");
  const name = packCacheName(routeId);
  const cache = await caches.open(name);
  const file = new PMTiles(OFFLINE_TILES_URL);
  let bytes = 0;
  let done = 0;
  let saved = 0;
  try {
    const queue = [...plan.tiles];
    const worker = async () => {
      for (let t = queue.shift(); t; t = queue.shift()) {
        if (signal?.aborted) throw new PackError("Stopped.");
        const tile = await file.getZxy(t.z, t.x, t.y, signal);
        if (tile?.data && tile.data.byteLength > 0) {
          bytes += tile.data.byteLength;
          if (bytes > PACK_MAX_BYTES) {
            throw new PackError("The map for this route is over 50 MB: save it a day at a time.");
          }
          await cache.put(
            packTileKey(t.z, t.x, t.y),
            new Response(tile.data, { headers: { "Content-Type": "application/x-protobuf" } }),
          );
          saved += 1;
        }
        done += 1;
        onProgress(done, plan.tiles.length);
      }
    };
    await Promise.all(Array.from({ length: PACK_CONCURRENCY }, worker));

    // Labels: the glyph ranges of the offline style's fonts, kept next to the file.
    const fonts = new URL("fonts/", OFFLINE_TILES_URL);
    for (const stack of PACK_FONTSTACKS) {
      for (const range of PACK_GLYPH_RANGES) {
        const res = await fetch(new URL(`${encodeURIComponent(stack)}/${range}.pbf`, fonts), {
          signal,
        });
        if (res.ok) {
          bytes += Number(res.headers.get("Content-Length") ?? 0);
          await cache.put(packGlyphKey(stack, range), res);
        }
      }
    }
  } catch (err) {
    await caches.delete(name);
    if (err instanceof PackError) throw err;
    throw new PackError("Could not download the map. Check the connection and try again.");
  }
  return { tiles: saved, bytes, maxZoom: plan.maxZoom };
}
