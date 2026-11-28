import { describe, expect, it } from "vitest";
import { spreadStops } from "@/lib/roadBook";

const place = (km: number, rank: number) => ({ id: `p${km}`, kmFromStart: km, rank });

describe("road book stops (G10)", () => {
  it("leaves out the start city and spreads the best stops along the road", () => {
    // 20 city places at km 0–5, then one good place every 30 km.
    const city = Array.from({ length: 20 }, (_, i) => place(i * 0.25, 3));
    const road = Array.from({ length: 10 }, (_, i) => place(40 + i * 30, 1 + (i % 3)));
    const picks = spreadStops([...city, ...road], 330, (p) => p.rank, 5);
    expect(picks).toHaveLength(5);
    expect(picks.every((p) => p.kmFromStart >= 25)).toBe(true);
    expect(picks.map((p) => p.kmFromStart)).toEqual(
      [...picks.map((p) => p.kmFromStart)].sort((a, b) => a - b),
    );
    // One from each stretch of about 61 km.
    expect(new Set(picks.map((p) => Math.floor((p.kmFromStart - 25) / 61))).size).toBe(5);
  });

  it("keeps them all when there are few", () => {
    expect(
      spreadStops([place(100, 1), place(50, 2)], 200, (p) => p.rank).map((p) => p.kmFromStart),
    ).toEqual([50, 100]);
  });
});
