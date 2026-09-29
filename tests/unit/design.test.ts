import { describe, expect, it } from "vitest";
import { linePart } from "@/components/map/useDrawIn";
import { stripMarks } from "@/components/trip/RoadStrip";
import type { LngLat } from "@/lib/geo";

describe("stripMarks", () => {
  it("marks the start, round km in between and the end", () => {
    expect(stripMarks(312.3)).toEqual([0, 100, 200, 312]);
    expect(stripMarks(337.6)).toEqual([0, 100, 200, 338]);
    expect(stripMarks(42)).toEqual([0, 20, 42]);
    expect(stripMarks(1250)).toEqual([0, 500, 1000, 1250]);
  });

  it("never puts a mark right next to the end", () => {
    // 290 km: a mark at 200 is kept, but not one crowding the end label.
    for (const km of [95, 190, 290, 505]) {
      const marks = stripMarks(km);
      const [beforeEnd, end] = marks.slice(-2) as [number, number];
      expect(end - beforeEnd).toBeGreaterThan(0.3 * (marks[1]! - marks[0]!));
    }
  });

  it("is just the start for a zero-length route", () => {
    expect(stripMarks(0)).toEqual([0]);
  });
});

describe("linePart", () => {
  const line: LngLat[] = Array.from({ length: 10 }, (_, i) => [i, 0]);

  it("keeps the first share of the points, at least two", () => {
    expect(linePart(line, 0)).toHaveLength(2);
    expect(linePart(line, 0.5)).toHaveLength(5);
    expect(linePart(line, 1)).toBe(line);
  });

  it("leaves short lines whole", () => {
    const short: LngLat[] = [
      [0, 0],
      [1, 1],
    ];
    expect(linePart(short, 0.1)).toBe(short);
  });
});
