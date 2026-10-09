import { describe, expect, it } from "vitest";
import type { LngLat } from "@/lib/geo";
import type { BBox } from "@/server/providers/osm";
import {
  buildRegionOutlineUrl,
  parseRegionOutline,
  regionOutlineResponseSchema,
} from "@/server/providers/osm/regionOutline";
import {
  OSM_REGIONS,
  outlineFitsRegion,
  padBBox,
  tilesFor,
  tileTouchesOutline,
} from "@/server/services/osmRegions";
import { runRegionTiles } from "@/server/services/osmTiles";
import { jsonFixture } from "../helpers/fixtures";

// Nominatim's answer for Chhattisgarh (tests/fixtures/nominatim/chhattisgarh-outline.json).
const outline = parseRegionOutline(
  regionOutlineResponseSchema.parse(jsonFixture("nominatim/chhattisgarh-outline.json")),
)!;
const square: LngLat[][][] = [
  [
    [
      [80, 20],
      [81, 20],
      [81, 21],
      [80, 21],
      [80, 20],
    ],
  ],
];
const contains = (tile: BBox, [x, y]: LngLat) =>
  x >= tile[0] && x <= tile[2] && y >= tile[1] && y <= tile[3];

describe("state outlines", () => {
  it("asks Nominatim for the state boundary, simplified", () => {
    const url = buildRegionOutlineUrl("https://nominatim.example/", "Chhattisgarh");
    expect(url).toContain("https://nominatim.example/search?state=Chhattisgarh&country=India");
    expect(url).toContain("featureType=state");
    expect(url).toContain("polygon_geojson=1");
  });

  it("reads a state boundary and refuses anything else", () => {
    expect(outline).toHaveLength(1);
    expect(outline[0]![0]!.length).toBeGreaterThan(500);
    const town = { osm_type: "node", category: "place", type: "town", addresstype: "town" };
    expect(
      parseRegionOutline([{ ...town, geojson: { type: "Point", coordinates: [81, 21] } }]),
    ).toBeNull();
    expect(parseRegionOutline([])).toBeNull();
  });

  it("tells tiles that touch a square from tiles that do not", () => {
    expect(tileTouchesOutline([80.2, 20.2, 80.4, 20.4], square, 0)).toBe(true); // inside
    expect(tileTouchesOutline([79, 19, 82, 22], square, 0)).toBe(true); // around it
    expect(tileTouchesOutline([80.9, 20.9, 81.5, 21.5], square, 0)).toBe(true); // overlaps a corner
    expect(tileTouchesOutline([79.5, 20.4, 82, 20.6], square, 0)).toBe(true); // crosses it
    expect(tileTouchesOutline([81.2, 20, 81.7, 20.5], square, 0)).toBe(false); // beside it
    expect(tileTouchesOutline([81.2, 20, 81.7, 20.5], square, 0.25)).toBe(true); // within the margin
  });

  it("keeps every Chhattisgarh tile with a town in it and skips about half the box", () => {
    const region = OSM_REGIONS.chhattisgarh;
    const tiles = tilesFor(padBBox(region.bbox, 0.02), 0.5);
    const kept = tiles.filter((t) => tileTouchesOutline(t, outline, 0.05));
    const towns: LngLat[] = [
      [81.63, 21.25], // Raipur
      [82.02, 19.07], // Jagdalpur
      [83.19, 23.12], // Ambikapur
      [82.15, 22.08], // Bilaspur
    ];
    for (const town of towns) {
      expect(kept.some((t) => contains(t, town))).toBe(true);
    }
    // Corners of the box in other states are skipped: Madhya Pradesh and Andhra Pradesh.
    expect(kept.some((t) => contains(t, [80.4, 23.9]))).toBe(false);
    expect(kept.some((t) => contains(t, [84.2, 18.0]))).toBe(false);
    expect(kept.length).toBeGreaterThan(tiles.length * 0.35);
    expect(kept.length).toBeLessThan(tiles.length * 0.75);
  });

  it("trusts an outline only when it fits the state's own box", () => {
    expect(outlineFitsRegion(outline, OSM_REGIONS.chhattisgarh.bbox)).toBe(true);
    expect(outlineFitsRegion(outline, OSM_REGIONS.kerala.bbox)).toBe(false);
  });

  it("never fetches a tile the outline rules out", async () => {
    const region = { name: "Test", iso: "IN-XX", bbox: [74.02, 15.02, 75.98, 15.98] as BBox };
    const fetched: BBox[] = [];
    const result = await runRegionTiles({
      region,
      state: { failedInARow: 0 },
      log: () => undefined,
      sleep: async () => undefined,
      pauseMs: 0,
      keepTile: (tile) => tile[0] < 75,
      fetchTile: async (tile) => {
        fetched.push(tile);
        return [];
      },
      onTile: async () => undefined,
    });
    expect(result).toMatchObject({ tiles: 1, outside: 1 });
    expect(fetched.every((t) => t[0] < 75)).toBe(true);
  });
});
