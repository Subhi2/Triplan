import { describe, expect, it } from "vitest";
import { routeDiffs, scenicTellsApart } from "@/lib/routeCompare";

const route = (id: string, durationMin: number, distanceKm: number, score?: number) => ({
  id,
  durationMin,
  distanceKm,
  scenic: score === undefined ? null : { score },
});

describe("routeDiffs", () => {
  it("measures each option against the fastest", () => {
    const diffs = routeDiffs([route("a", 300, 337), route("b", 318, 349.3), route("c", 299, 360)]);
    expect(diffs.c).toEqual({ slowerMin: 0, longerKm: 0 });
    expect(diffs.a).toEqual({ slowerMin: 1, longerKm: -23 });
    expect(diffs.b).toEqual({ slowerMin: 19, longerKm: -10.7 });
  });

  it("calls tiny differences the same, and says nothing with one option", () => {
    expect(routeDiffs([route("a", 60, 64), route("b", 60.4, 64.3)]).b).toEqual({
      slowerMin: 0,
      longerKm: 0,
    });
    expect(routeDiffs([route("a", 60, 64)])).toEqual({});
  });
});

describe("scenicTellsApart", () => {
  it("hides a score every option shares", () => {
    expect(scenicTellsApart([route("a", 1, 1, 4), route("b", 2, 2, 4), route("c", 3, 3, 4)])).toBe(
      false,
    );
    expect(scenicTellsApart([route("a", 1, 1, 4), route("b", 2, 2, 6)])).toBe(true);
    expect(scenicTellsApart([route("a", 1, 1, 4)])).toBe(true);
  });
});
