import { describe, expect, it } from "vitest";
import { metresAlong, type LngLat } from "@/lib/geo";
import { stopIndexAt, viaInsertIndex } from "@/lib/trip";
import { routeFixture } from "../helpers/fixtures";

const BENGALURU: LngLat = [77.5946, 12.9716];
const HASSAN: LngLat = [76.0962, 13.0033];
const SAKLESHPUR: LngLat = [75.785, 12.943];
const MUDIGERE: LngLat = [75.6397, 13.1365];
const KALASA: LngLat = [75.356, 13.234];

// Bengaluru → Sakleshpur → Kalasa, recorded from OSRM: NH75 through Hassan, then Mudigere.
const [viaSakleshpur] = routeFixture("bengaluru-sakleshpur-kalasa");
const line = viaSakleshpur!.geometry.coordinates as LngLat[];

describe("metresAlong", () => {
  const north: LngLat[] = [
    [0, 0],
    [0, 1],
    [0, 2],
  ];

  it("measures to the nearest point on the line", () => {
    expect(metresAlong(north, [0.01, 0.5]) / 1000).toBeCloseTo(55.6, 0);
    expect(metresAlong(north, [-0.02, 1.5]) / 1000).toBeCloseTo(166.8, 0);
  });

  it("clamps points beyond either end", () => {
    expect(metresAlong(north, [0, -1])).toBe(0);
    expect(metresAlong(north, [0, 3]) / 1000).toBeCloseTo(222.4, 0);
  });

  it("orders towns along a real route", () => {
    const kms = [BENGALURU, HASSAN, SAKLESHPUR, MUDIGERE, KALASA].map(
      (p) => metresAlong(line, p) / 1000,
    );
    expect(kms).toEqual([...kms].sort((a, b) => a - b));
    expect(kms[0]).toBeLessThan(1);
    expect(kms.at(-1)).toBeCloseTo(viaSakleshpur!.distanceM / 1000, -1);
  });
});

describe("viaInsertIndex", () => {
  it("puts a place before the first via stop further along the route", () => {
    const stops = [BENGALURU, SAKLESHPUR, KALASA];
    expect(viaInsertIndex(stops, line, HASSAN)).toBe(1);
    expect(viaInsertIndex(stops, line, MUDIGERE)).toBe(2);
  });

  it("goes between via stops", () => {
    expect(viaInsertIndex([BENGALURU, HASSAN, MUDIGERE, KALASA], line, SAKLESHPUR)).toBe(2);
  });

  it("goes just before the destination without via stops", () => {
    expect(viaInsertIndex([BENGALURU, KALASA], line, SAKLESHPUR)).toBe(1);
  });

  it("leaves empty via stops where they are", () => {
    expect(viaInsertIndex([BENGALURU, null, SAKLESHPUR, KALASA], line, MUDIGERE)).toBe(3);
    expect(viaInsertIndex([BENGALURU, null, SAKLESHPUR, KALASA], line, HASSAN)).toBe(2);
  });
});

describe("stopIndexAt", () => {
  const stops = [BENGALURU, null, SAKLESHPUR, KALASA];

  it("finds the stop at a place, within 150 m", () => {
    expect(stopIndexAt(stops, [75.7855, 12.9435])).toBe(2);
    expect(stopIndexAt(stops, KALASA)).toBe(3);
  });

  it("is -1 when no stop is there", () => {
    expect(stopIndexAt(stops, [75.79, 12.943])).toBe(-1); // about 540 m away
    expect(stopIndexAt(stops, HASSAN)).toBe(-1);
  });
});
