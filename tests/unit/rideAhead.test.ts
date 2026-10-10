import { describe, expect, it } from "vitest";
import type { LngLat } from "@/lib/geo";
import type { PlaceNear } from "@/lib/nearby";
import {
  angleDiff,
  compassPoint,
  nextHeading,
  NO_HEADING,
  placesAhead,
  shouldRequery,
  type Fix,
} from "@/lib/rideAhead";

const ME: LngLat = [75.785, 12.943];
// About 1 km per 0.009° of latitude.
const north = (km: number, eastKm = 0): LngLat => [ME[0] + eastKm * 0.0092, ME[1] + km * 0.009];

function fix(location: LngLat, extra: Partial<Fix> = {}): Fix {
  return { location, accuracyM: 20, headingDeg: null, speedMps: null, ...extra };
}

function place(id: string, location: LngLat, fame = 2): PlaceNear {
  return {
    id,
    slug: id,
    name: id,
    category: "fort",
    location,
    distanceKm: 0,
    roadKm: null,
    rideMin: null,
    bearingDeg: 0,
    rating: null,
    ratingCount: 0,
    bestMonths: [],
    bestMonthsEstimated: false,
    thumbUrl: null,
    trending: false,
    notable: true,
    fame,
  };
}

describe("angleDiff", () => {
  it("wraps around north", () => {
    expect(angleDiff(350, 10)).toBe(20);
    expect(angleDiff(10, 350)).toBe(-20);
    expect(angleDiff(0, 180)).toBe(-180);
    expect(angleDiff(90, 90)).toBe(0);
  });
});

describe("nextHeading", () => {
  it("takes the bearing once the rider has moved 60 m", () => {
    let h = nextHeading(NO_HEADING, fix(ME));
    expect(h.headingDeg).toBeNull();
    h = nextHeading(h, fix(north(0.03))); // 30 m: not yet
    expect(h.headingDeg).toBeNull();
    h = nextHeading(h, fix(north(0.1)));
    expect(h.headingDeg).toBeCloseTo(0, 0);
  });

  it("uses the device's heading only when moving", () => {
    const start = nextHeading(NO_HEADING, fix(ME));
    expect(nextHeading(start, fix(ME, { headingDeg: 90, speedMps: 0.5 })).headingDeg).toBeNull();
    expect(nextHeading(start, fix(ME, { headingDeg: 90, speedMps: 10 })).headingDeg).toBe(90);
  });

  it("keeps the heading while stopped and ignores inaccurate fixes", () => {
    const moving = { headingDeg: 45, anchor: ME };
    expect(nextHeading(moving, fix(north(0.01)))).toBe(moving);
    expect(nextHeading(moving, fix(north(1), { accuracyM: 500 }))).toBe(moving);
  });

  it("smooths towards a new heading", () => {
    const h = nextHeading({ headingDeg: 0, anchor: ME }, fix(ME, { headingDeg: 90, speedMps: 5 }));
    expect(h.headingDeg).toBe(45);
    const wrap = nextHeading(
      { headingDeg: 350, anchor: ME },
      fix(ME, { headingDeg: 30, speedMps: 5 }),
    );
    expect(wrap.headingDeg).toBe(10);
  });
});

describe("shouldRequery", () => {
  const last = { at: ME, t: 0 };
  it("asks at the start, then only after 2 km and a minute", () => {
    expect(shouldRequery(null, ME, 0)).toBe(true);
    expect(shouldRequery(last, north(3), 30_000)).toBe(false);
    expect(shouldRequery(last, north(1), 120_000)).toBe(false);
    expect(shouldRequery(last, north(3), 120_000)).toBe(true);
  });
});

describe("placesAhead", () => {
  const ahead = place("ahead", north(10));
  const behind = place("behind", north(-10));
  const right = place("right", north(10, 10)); // 45° to the right
  const tooFar = place("tooFar", north(40));
  const here = place("here", north(0.1));

  it("keeps places in the cone ahead, within 0.3–30 km", () => {
    const ids = placesAhead([ahead, behind, right, tooFar, here], ME, 0, new Set(), 9).map(
      (a) => a.place.id,
    );
    expect(ids).toEqual(["ahead"]);
  });

  it("keeps a place already shown at a wider angle", () => {
    const at40 = place("at40", north(10, 8.4)); // ~40° right
    expect(placesAhead([at40], ME, 0, new Set(), 9)).toHaveLength(0);
    expect(placesAhead([at40], ME, 0, new Set(["at40"]), 9)).toHaveLength(1);
  });

  it("shows the best six, nearest first, with the turn for the arrow", () => {
    const many = Array.from({ length: 10 }, (_, i) => place(`p${i}`, north(20 - i), i));
    const shown = placesAhead(many, ME, 0, new Set(), 9);
    expect(shown.map((a) => a.place.id)).toEqual(["p9", "p8", "p7", "p6", "p5", "p4"]);
    expect(Math.abs(shown[0]!.turnDeg)).toBeLessThan(1);
    const turned = placesAhead([right], ME, 30, new Set(), 9)[0]!;
    expect(turned.turnDeg).toBeGreaterThan(0);
  });
});

describe("compassPoint", () => {
  it.each([
    [0, "N"],
    [44, "NE"],
    [180, "S"],
    [315, "NW"],
    [359, "N"],
  ])("%s°", (deg, name) => {
    expect(compassPoint(deg)).toBe(name);
  });
});
