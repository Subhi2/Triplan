import { describe, expect, it } from "vitest";
import { routeTimeline } from "@/lib/multiDay";
import type { PlaceAlong } from "@/lib/places";
import { planSunsetStops, SUNSET_EARLY_MIN } from "@/lib/sunset";

// 1 km of road is 1 minute of riding.
const timeline = routeTimeline(undefined, 400, 400);
const departAt = new Date(2026, 9, 14, 9, 0);
const MIN = 60_000;

function place(
  id: string,
  km: number,
  category: string,
  { detourKm = 0, notable = false } = {},
): PlaceAlong {
  return {
    id,
    slug: id,
    name: id,
    category,
    location: [75.36, 13.23],
    kmFromStart: km,
    detourKm,
    rating: null,
    ratingCount: 0,
    bestMonths: [],
    bestMonthsEstimated: false,
    thumbUrl: null,
    trending: false,
    notable,
  };
}

describe("planSunsetStops", () => {
  it("picks the best viewpoint, peak, beach or lake in the last quarter of the ride", () => {
    const stops = planSunsetStops(
      [
        place("early-view", 200, "viewpoint", { notable: true }), // not in the last quarter
        place("plain-lake", 320, "lake"),
        place("famous-view", 350, "viewpoint", { notable: true }),
        place("fort", 380, "fort", { notable: true }), // not a sunset category
        place("far-peak", 390, "peak", { detourKm: 6, notable: true }), // too far off the road
      ],
      { departAt, timeline },
    );
    expect(stops.map((s) => s.place.id)).toEqual(["famous-view"]);
  });

  it("gives the start time that arrives 30 minutes before sunset", () => {
    const [stop] = planSunsetStops([place("view", 350, "viewpoint", { detourKm: 2 })], {
      departAt,
      timeline,
    });
    // 350 min riding + 2 × 15 min of breaks + 3 min of detour at 40 km/h.
    expect(stop!.arriveAt.getTime() - departAt.getTime()).toBe((350 + 30 + 3) * MIN);
    expect(stop!.leaveBy.getTime() - departAt.getTime()).toBe(
      stop!.sunset.getTime() - SUNSET_EARLY_MIN * MIN - stop!.arriveAt.getTime(),
    );
    expect(stop!.sunset.getTime()).toBeGreaterThan(departAt.getTime());
  });

  it("finds one for each day of a split ride, measured from that day's start", () => {
    const stops = planSunsetStops(
      [place("day-one-view", 190, "viewpoint"), place("day-two-beach", 395, "beach")],
      {
        departAt,
        timeline,
        days: [
          { fromKm: 0, toKm: 200 },
          { fromKm: 200, toKm: 400 },
        ],
      },
    );
    expect(stops.map((s) => [s.place.id, s.day])).toEqual([
      ["day-one-view", 0],
      ["day-two-beach", 1],
    ]);
    // Day 2 starts a day later at the same time; 195 min riding + 15 min of breaks.
    const day2 = stops[1]!;
    expect(day2.arriveAt.getTime() - departAt.getTime()).toBe(24 * 60 * MIN + (195 + 15) * MIN);
  });

  it("leaves out a day with nothing to watch the sunset from", () => {
    expect(planSunsetStops([place("temple", 390, "temple")], { departAt, timeline })).toEqual([]);
  });
});
