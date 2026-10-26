import { describe, expect, it } from "vitest";
import { planBreaks, type BreakCandidate } from "@/lib/breaks";
import { routeTimeline } from "@/lib/multiDay";

// 1 km of road is 1 minute of riding, so a mark's window is easy to read.
const timeline = routeTimeline(undefined, 400, 400);
const at = (h: number, m = 0) => new Date(2026, 9, 14, h, m);

function stop(
  id: string,
  km: number,
  category: BreakCandidate["category"] = "coffee",
  detourKm = 0.2,
): BreakCandidate {
  return {
    id,
    name: id,
    category,
    location: [75, 13],
    kmFromStart: km,
    detourKm,
  };
}

describe("planBreaks", () => {
  it("picks the nearest food, coffee or fuel stop within 20 minutes of each 2-hour mark", () => {
    const plan = planBreaks(
      [
        stop("early", 90),
        stop("near", 115, "food"),
        stop("far", 250, "fuel"),
        stop("temple", 120, "temple"),
        stop("off-road", 122, "coffee", 1.4),
      ],
      { departAt: at(6), timeline },
    );
    expect(plan.marks).toEqual([120, 240, 360]);
    expect(plan.stops.map((s) => s.place.id)).toEqual(["near", "far"]);
    // 360 has nothing in its window.
    expect(plan.stops).toHaveLength(2);
  });

  it("prefers a stop outside 2–4 pm over a nearer one inside it", () => {
    // Leave at noon. A stop at minute 100 arrives at 13:40 (no break yet). A stop at minute 120
    // arrives at 14:15, because the 2-hour mark adds its 15-minute break.
    const plan = planBreaks([stop("dip", 120), stop("clear", 100)], {
      departAt: at(12),
      timeline,
    });
    expect(plan.stops[0]!.place.id).toBe("clear");
    expect(plan.stops[0]!.arriveAt.getHours()).toBe(13);
  });

  it("keeps a stop in the dip when it is the only one in the window", () => {
    const plan = planBreaks([stop("only", 120)], { departAt: at(12), timeline });
    expect(plan.stops.map((s) => s.place.id)).toEqual(["only"]);
    expect(plan.stops[0]!.arriveAt.getHours()).toBe(14);
  });

  it("starts the count again each day of a split", () => {
    const plan = planBreaks([stop("day1", 110), stop("day2", 310)], {
      departAt: at(6),
      timeline,
      days: [
        { fromKm: 0, toKm: 200 },
        { fromKm: 200, toKm: 400 },
      ],
    });
    // Each day is 200 minutes, so one mark per day, not one at 240 across the night.
    expect(plan.marks).toEqual([120, 320]);
    expect(plan.stops.map((s) => s.place.id)).toEqual(["day1", "day2"]);
  });
});
