import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { OsmTileTooBigError, type BBox } from "@/server/providers/osm";
import { mergeProgress, readProgress } from "@/server/services/importProgress";
import type { OsmRegion } from "@/server/services/osmRegions";
import { formatBBox, pendingTiles, runRegionTiles } from "@/server/services/osmTiles";

// A 2° by 1° region in 1° tiles; with splitAboveDeg 0.5 every tile becomes four half-degree ones.
const region: OsmRegion = { name: "Test", iso: "IN-XX", bbox: [74.02, 15.02, 75.98, 15.98] };
const element = { id: "node/1", location: [74.5, 15.5] as [number, number], extentM: 0, tags: {} };
const base = { region, log: () => undefined, sleep: async () => undefined, pauseMs: 0 };

async function runPart(index: number, count: number, tooBig: (b: BBox) => boolean = () => false) {
  const fetched: string[] = [];
  const result = await runRegionTiles({
    ...base,
    state: { failedInARow: 0 },
    splitAboveDeg: 0.5,
    part: { index, count },
    fetchTile: async (bbox) => {
      if (tooBig(bbox)) throw new OsmTileTooBigError("timed out");
      fetched.push(formatBBox(bbox));
      return [element];
    },
    onTile: async () => undefined,
  });
  return { fetched, result };
}

describe("parts of a region", () => {
  it("splits big tiles first and deals the halves out to the parts, each once", async () => {
    const parts = await Promise.all([0, 1, 2].map((i) => runPart(i, 3)));
    const all = parts.flatMap((p) => p.fetched);
    expect(all).toHaveLength(8);
    expect(new Set(all).size).toBe(8);
    for (const p of parts) expect(p.result.failed).toEqual([]);
  });

  it("keeps the halves of a tile a part had to split with that part", async () => {
    // Somebody's half-degree tile times out: its quarters must all be fetched, by that part.
    const victim = (b: BBox) => b[0] < 74.3 && b[1] < 15.3 && b[2] - b[0] > 0.3;
    const parts = await Promise.all([0, 1].map((i) => runPart(i, 2, victim)));
    const all = parts.flatMap((p) => p.fetched);
    expect(all).toHaveLength(7 + 4);
    expect(new Set(all).size).toBe(11);
    const splitter = parts.find((p) =>
      p.fetched.some((k) => k.startsWith("[74.000, 15.000, 74.250")),
    );
    expect(splitter!.fetched.filter((k) => JSON.parse(k)[2] - JSON.parse(k)[0] < 0.3)).toHaveLength(
      4,
    );
  });

  it("knows which tiles are still to fetch", () => {
    const walk = { splitAboveDeg: 0.5 };
    expect(pendingTiles(region, walk)).toHaveLength(8);
    const some = pendingTiles(region, walk).slice(0, 5).map(formatBBox);
    expect(
      pendingTiles(region, { ...walk, resume: { done: new Set(some), split: new Set() } }),
    ).toHaveLength(3);
    const outside = (t: BBox) => t[0] < 75;
    expect(pendingTiles(region, { ...walk, keepTile: outside })).toHaveLength(4);
  });
});

describe("merged resume files", () => {
  const dir = mkdtempSync(join(tmpdir(), "import-parts-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("keeps every part's tiles and the first start time", () => {
    const path = join(dir, "places-test.json");
    const empty = { complete: false, elements: 0, split: [] };
    mergeProgress(path, { ...empty, startedAt: "2026-10-09 10:00:00+00", done: ["a", "b"] });
    mergeProgress(path, {
      ...empty,
      startedAt: "2026-10-09 10:00:05+00",
      done: ["c"],
      elements: 7,
    });
    mergeProgress(path, { ...empty, startedAt: "2026-10-09 10:00:00+00", done: ["a", "b", "d"] });
    expect(readProgress(path)).toEqual({
      startedAt: "2026-10-09 10:00:00+00",
      complete: false,
      elements: 7,
      done: ["a", "b", "c", "d"],
      split: [],
    });
  });
});
