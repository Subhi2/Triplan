import { describe, expect, it } from "vitest";
import { pickStops, stopMinutes, stopWorth, isSight } from "@/lib/pickStops";
import type { PlaceAlong } from "@/lib/places";

function place(
  id: string,
  km: number,
  category: string,
  { detourKm = 0.2, notable = true, bestMonths = [] as number[] } = {},
): PlaceAlong {
  return {
    id,
    slug: id,
    name: id,
    category,
    location: [75, 13],
    kmFromStart: km,
    detourKm,
    rating: null,
    ratingCount: 0,
    bestMonths,
    bestMonthsEstimated: false,
    thumbUrl: null,
    trending: false,
    notable,
  };
}

const opts = { month: null, maxStops: 9, routeKm: 300 };

describe("stopMinutes and stopWorth", () => {
  it("counts the detour there and back at 40 km/h plus the category's visit", () => {
    // 2 × 5 km at 40 km/h = 15 min, plus a fort's 60.
    expect(stopMinutes({ category: "fort", detourKm: 5 })).toBe(75);
    expect(stopMinutes({ category: "viewpoint", detourKm: 0 })).toBe(15);
  });

  it("is worth 1.3 times more in its best months", () => {
    const p = place("falls", 100, "waterfall", { bestMonths: [7, 8] });
    expect(stopWorth(p, 8)).toBeCloseTo(stopWorth(p, 1) * 1.3);
    expect(stopWorth(p, null)).toBe(stopWorth(p, 1));
  });

  it("treats food, coffee, fuel, stays and towns as not sights", () => {
    expect(["food", "coffee", "fuel", "stay", "town", "nonsense"].some(isSight)).toBe(false);
    expect(isSight("fort")).toBe(true);
  });
});

describe("pickStops", () => {
  it("picks the most worth that fits the time, in km order", () => {
    const pick = pickStops(
      [
        place("fort", 200, "fort"), // 61 min, worth 2
        place("temple", 150, "temple"), // 31 min, worth 1.9
        place("plain-lake", 120, "lake", { notable: false }), // 21 min, worth 0.9
        place("trek", 180, "trek"), // 121 min: does not fit
      ],
      120,
      opts,
    );
    expect(pick.places.map((p) => p.id)).toEqual(["temple", "fort"]);
    expect(pick.minutes).toBeLessThanOrEqual(120);
  });

  it("keeps to one stop per hour, and always offers one", () => {
    const many = Array.from({ length: 10 }, (_, i) => place(`view-${i}`, 50 + i * 10, "viewpoint"));
    expect(pickStops(many, 120, opts).places).toHaveLength(2);
    expect(pickStops(many, 240, opts).places).toHaveLength(4);
    expect(pickStops(many, 30, opts).places).toHaveLength(1);
    expect(pickStops(many, 240, { ...opts, maxStops: 3 }).places).toHaveLength(3);
  });

  it("prefers a place in season", () => {
    const pick = pickStops(
      [
        place("dry-falls", 100, "waterfall", { bestMonths: [7, 8] }),
        place("view", 110, "viewpoint", { bestMonths: [1, 2] }),
      ],
      60,
      { ...opts, month: 8 },
    );
    expect(pick.places.map((p) => p.id)).toEqual(["dry-falls"]);
  });

  it("skips the start of the route, places far off the road, and what is not a sight", () => {
    const pick = pickStops(
      [
        place("city-church", 12, "worship"), // inside the first 25 km of 300
        place("far-fort", 100, "fort", { detourKm: 6 }),
        place("cafe", 100, "coffee"),
        place("view", 150, "viewpoint", { notable: false }),
      ],
      240,
      opts,
    );
    expect(pick.places.map((p) => p.id)).toEqual(["view"]);
    // A short route skips only its first 10%.
    expect(
      pickStops([place("near-start", 6, "temple")], 60, { ...opts, routeKm: 50 }).places,
    ).toHaveLength(1);
  });

  it("of equal worth, takes the one that needs less time", () => {
    const pick = pickStops(
      [
        place("far", 100, "temple", { detourKm: 4 }),
        place("near", 120, "temple", { detourKm: 0.1 }),
      ],
      60,
      opts,
    );
    expect(pick.places.map((p) => p.id)).toEqual(["near"]);
  });

  it("returns nothing when nothing fits", () => {
    expect(pickStops([place("trek", 100, "trek")], 60, opts)).toEqual({ places: [], minutes: 0 });
    expect(pickStops([], 60, opts)).toEqual({ places: [], minutes: 0 });
  });
});
