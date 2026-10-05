import { describe, expect, it, vi } from "vitest";
import { OsmServerBusyError, OsmTileTooBigError, type BBox } from "@/server/providers/osm";
import type { OsmRegion } from "@/server/services/osmRegions";
import { ImportStopped, runRegionTiles } from "@/server/services/osmTiles";

// A one-tile region (1° square), so every tile in a test is easy to follow.
const region: OsmRegion = { name: "Test", iso: "IN-XX", bbox: [74.02, 15.02, 74.98, 15.98] };
const element = { id: "node/1", location: [74.5, 15.5] as [number, number], extentM: 0, tags: {} };
const base = { region, log: () => undefined, sleep: async () => undefined, pauseMs: 0 };

describe("runRegionTiles", () => {
  it("splits a tile Overpass finds too big and goes on with the halves", async () => {
    const fetchTile = vi.fn(async (bbox: BBox) => {
      if (bbox[2] - bbox[0] > 0.6) throw new OsmTileTooBigError("timed out");
      return [element];
    });
    const onTile = vi.fn(async () => undefined);
    const result = await runRegionTiles({ ...base, state: { failedInARow: 0 }, fetchTile, onTile });
    expect(result.failed).toEqual([]);
    expect(result.tiles).toBe(4);
    expect(onTile).toHaveBeenCalledTimes(4);
  });

  it("waits out a busy server and tries again", async () => {
    let calls = 0;
    const sleep = vi.fn(async () => undefined);
    const fetchTile = vi.fn(async () => {
      if (++calls === 1) throw new OsmServerBusyError("HTTP 429", 429);
      return [element];
    });
    const result = await runRegionTiles({
      ...base,
      sleep,
      state: { failedInARow: 0 },
      fetchTile,
      onTile: async () => undefined,
    });
    expect(result.tiles).toBe(1);
    expect(sleep).toHaveBeenCalledWith(15_000);
  });

  it("marks a tile failed when saving it throws, and keeps going", async () => {
    const result = await runRegionTiles({
      ...base,
      state: { failedInARow: 0 },
      fetchTile: async () => [element],
      onTile: async () => {
        throw new Error("database down");
      },
    });
    expect(result.failed).toHaveLength(1);
  });

  it("stops when tiles keep failing", async () => {
    const state = { failedInARow: 2 };
    await expect(
      runRegionTiles({
        ...base,
        state,
        fetchTile: async () => {
          throw new Error("HTTP 400");
        },
        onTile: async () => undefined,
      }),
    ).rejects.toBeInstanceOf(ImportStopped);
  });
});
