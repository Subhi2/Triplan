import { describe, expect, it } from "vitest";
import { scenicRouteId, scenicScore } from "@/lib/scenic";
import type { RoadMix } from "@/lib/trip";

function mix(ghatShare: number): RoadMix {
  const total = 100_000;
  return {
    nationalM: total * (1 - ghatShare),
    stateM: 0,
    ghatM: total * ghatShare,
    otherM: 0,
    ghats: [],
  };
}

describe("scenicScore", () => {
  // Counts measured on real routes (2026-10-15), within 2 km of the road.
  it("scores a Himalayan road full marks", () => {
    const leh = scenicScore({
      counts: { fort: 2, lake: 3, peak: 2, viewpoint: 15, waterfall: 15 },
      distanceKm: 424,
      roadMix: mix(0.45),
      twistyKm: 0,
    });
    expect(leh).toEqual({ score: 10, sights: 34 });
  });

  it("scores the Western Ghats well above a plains highway", () => {
    const kalasa = scenicScore({
      counts: { fort: 3, lake: 7, peak: 1 },
      distanceKm: 314,
      roadMix: mix(0.18),
      twistyKm: 0,
    });
    const chennai = scenicScore({
      counts: { fort: 1, lake: 25, viewpoint: 4 },
      distanceKm: 326,
      roadMix: mix(0.01),
      twistyKm: 0,
    });
    expect(kalasa.score).toBe(4);
    expect(chennai.score).toBe(2);
    // Village tanks count for little and are not listed as sights.
    expect(chennai.sights).toBe(5);
  });

  it("uses the twisty km when the road mix has no ghats", () => {
    const twisty = scenicScore({ counts: {}, distanceKm: 100, roadMix: null, twistyKm: 35 });
    expect(twisty.score).toBe(7);
  });

  it("is 0 for an empty route", () => {
    expect(
      scenicScore({ counts: { viewpoint: 3 }, distanceKm: 0, roadMix: null, twistyKm: 0 }),
    ).toEqual({ score: 0, sights: 0 });
  });
});

describe("scenicRouteId", () => {
  const route = (id: string, durationMin: number, score: number | null) => ({
    id,
    durationMin,
    scenic: score === null ? null : { score, sights: 0 },
  });

  it("labels the most scenic route when it beats the fastest by a point", () => {
    expect(
      scenicRouteId([route("fast", 300, 3), route("ghat", 340, 6), route("mid", 320, 4)]),
    ).toBe("ghat");
  });

  it("labels none when the fastest is also the most scenic, or the lead is too small", () => {
    expect(scenicRouteId([route("fast", 300, 6), route("slow", 340, 5)])).toBeNull();
    expect(scenicRouteId([route("fast", 300, 5), route("slow", 340, 5)])).toBeNull();
  });

  it("labels none with one route or missing scores", () => {
    expect(scenicRouteId([route("only", 300, 9)])).toBeNull();
    expect(scenicRouteId([route("fast", 300, null), route("slow", 340, 8)])).toBeNull();
  });
});
