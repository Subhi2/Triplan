import { describe, expect, it } from "vitest";
import {
  buildFlyPath,
  flySeconds,
  kmAtTime,
  lookBearing,
  pointAt,
  smoothAngle,
  timeAtKm,
  zoomAt,
} from "@/lib/flyover";
import type { LngLat } from "@/lib/geo";
import { routeFixture } from "../helpers/fixtures";

const M_PER_DEG_LAT = 111_195;
/** 20 km due north from 12°N, 76°E. */
const north: LngLat[] = [
  [76, 12],
  [76, 12 + 20_000 / M_PER_DEG_LAT],
];

describe("flyover camera", () => {
  it("measures the road and spends equal time on equal open road", () => {
    const path = buildFlyPath(north, []);
    expect(path.totalKm).toBeCloseTo(20, 1);
    expect(path.time[0]).toBe(0);
    expect(path.time.at(-1)).toBe(1);
    expect(kmAtTime(path, 0.5)).toBeCloseTo(10, 1);
    expect(timeAtKm(path, 5)).toBeCloseTo(0.25, 2);
  });

  it("lingers in ghats: half the road in a ghat takes most of the time", () => {
    const path = buildFlyPath(north, [[0.5, 1]]);
    expect(timeAtKm(path, 10)).toBeCloseTo(0.2, 1); // 10 km open, then 10 km ghat at 4×
    // Time always moves the camera forward.
    for (let i = 1; i < path.time.length; i++)
      expect(path.time[i]!).toBeGreaterThan(path.time[i - 1]!);
  });

  it("slows near hairpins and places", () => {
    const plain = buildFlyPath(north, []);
    const slowed = buildFlyPath(north, [], [5]);
    expect(timeAtKm(slowed, 5.5) - timeAtKm(slowed, 4.5)).toBeGreaterThan(
      timeAtKm(plain, 5.5) - timeAtKm(plain, 4.5),
    );
  });

  it("faces down the road and zooms in through ghats", () => {
    const path = buildFlyPath(north, [[0.6, 1]]);
    expect(lookBearing(path, 3)).toBeCloseTo(0, 0); // north
    expect(lookBearing(path, path.totalKm)).toBeCloseTo(0, 0); // still north at the very end
    expect(zoomAt(path, 18)).toBeGreaterThan(zoomAt(path, 3));
    expect(pointAt(path, 10)[1]).toBeCloseTo(12 + 10_000 / M_PER_DEG_LAT, 4);
  });

  it("turns the camera the short way round, gradually", () => {
    expect(smoothAngle(350, 10, 100, 0.8)).toBeCloseTo(370, 3); // across north, not back round
    expect(smoothAngle(10, 350, 100, 0.8)).toBeCloseTo(-10, 3);
    const step = smoothAngle(0, 90, 0.1, 0.8);
    expect(step).toBeGreaterThan(0);
    expect(step).toBeLessThan(20);
  });

  it("gives a real route a sensible running time", () => {
    const [route] = routeFixture("bengaluru-sakleshpur-kalasa");
    const path = buildFlyPath(
      route!.geometry.coordinates as LngLat[],
      route!.legs.length ? [] : [],
    );
    expect(flySeconds(path.totalKm)).toBeGreaterThan(80);
    expect(flySeconds(path.totalKm)).toBeLessThan(110);
    expect(flySeconds(0)).toBe(45);
    expect(flySeconds(5000)).toBe(150);
  });
});
