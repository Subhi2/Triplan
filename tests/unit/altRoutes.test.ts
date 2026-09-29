import { describe, expect, it } from "vitest";
import type { LngLat } from "@/lib/geo";
import {
  sampleRoute,
  sharedShare,
  viaTownCandidates,
  type CandidateTown,
} from "@/server/services/altRoutes";
import { routeFixture } from "../helpers/fixtures";

const line = (coordinates: LngLat[]) => sampleRoute({ type: "LineString", coordinates });
const town = (name: string, location: LngLat, population: number | null = null): CandidateTown => ({
  name,
  location,
  population,
  kind: "town",
});

describe("sharedShare", () => {
  it("measures how much of one route runs along another", () => {
    const a = line([
      [76, 12],
      [77, 12],
    ]);
    const firstHalf = line([
      [76, 12],
      [76.5, 12],
    ]);
    const elsewhere = line([
      [76, 13],
      [77, 13],
    ]);
    expect(sharedShare(a, a)).toBe(1);
    expect(sharedShare(a, elsewhere)).toBe(0);
    expect(sharedShare(a, firstHalf)).toBeCloseTo(0.5, 1);
  });

  it("tells the real Bengaluru → Samse routes apart", () => {
    const [a, b] = routeFixture("bengaluru-samse").map((r) => sampleRoute(r.geometry));
    const [belur] = routeFixture("bengaluru-belur-samse").map((r) => sampleRoute(r.geometry));
    expect(sharedShare(a!, b!)).toBeLessThan(0.4); // share only Bengaluru's exit and the last hills
    expect(sharedShare(belur!, a!)).toBeLessThan(0.8); // leaves NH73 at Tiptur for Arsikere–Belur
  });
});

describe("viaTownCandidates", () => {
  const start: LngLat = [76, 12];
  const end: LngLat = [78, 12]; // ~218 km east
  const routes = [
    line([
      [76, 12],
      [78, 12],
    ]),
  ];

  it("picks towns on the way and off the existing routes, the most on-the-way first", () => {
    const towns = [
      town("On the route", [77, 12.01]),
      town("Near the start", [76.2, 12.2]),
      town("Far off the line", [77, 13]),
      town("Big city a bit off", [77, 12.3], 500_000),
      town("Small town", [77.5, 12.2], 10_000),
      town("Bigger town beside it", [77.52, 12.2], 50_000),
    ];
    expect(viaTownCandidates(start, end, towns, routes, 5).map((t) => t.name)).toEqual([
      "Bigger town beside it", // as much on the way as "Small town", and larger
      "Small town",
      "Big city a bit off",
    ]);
    expect(viaTownCandidates(start, end, towns, routes, 1)).toHaveLength(1);
  });

  it("offers nothing for short trips", () => {
    const near: LngLat = [76.2, 12];
    expect(viaTownCandidates(start, near, [town("Midway", [76.1, 12.1])], [], 3)).toEqual([]);
  });
});
