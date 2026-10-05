import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { routeCurvature } from "@/lib/curvature";
import type { LngLat } from "@/lib/geo";
import { monthRange, ridePlannerUrl, ridesFileSchema, type RideSource } from "@/lib/rides";
import { parseTripUrl } from "@/lib/tripUrl";
import { buildRide, distanceToLineM, rideProblems } from "@/server/services/rideService";
import { routeFixture } from "../helpers/fixtures";

const rides = ridesFileSchema.parse(JSON.parse(readFileSync("data/rides.json", "utf8")));
const valparai = rides.find((r) => r.slug === "pollachi-to-valparai")!;

describe("data/rides.json", () => {
  it("holds about twenty valid rides with unique slugs, all in India", () => {
    expect(rides.length).toBeGreaterThanOrEqual(15);
    expect(new Set(rides.map((r) => r.slug)).size).toBe(rides.length);
    for (const r of rides) {
      for (const s of [...r.stops, ...r.checkpoints]) {
        const [lng, lat] = s.location;
        expect(lng, `${r.slug} ${s.label}`).toBeGreaterThan(68);
        expect(lng, `${r.slug} ${s.label}`).toBeLessThan(98);
        expect(lat, `${r.slug} ${s.label}`).toBeGreaterThan(6);
        expect(lat, `${r.slug} ${s.label}`).toBeLessThan(37);
      }
    }
  });
});

describe("monthRange", () => {
  it("reads runs of months, across the new year too", () => {
    expect(monthRange([9, 10, 11, 12, 1, 2])).toBe("Sep–Feb");
    expect(monthRange([3, 4, 5, 10, 11])).toBe("Mar–May, Oct–Nov");
    expect(monthRange([7])).toBe("Jul");
    expect(monthRange([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])).toBe("All year");
  });
});

describe("ridePlannerUrl", () => {
  it("opens the planner with the ride's stops and vehicle", () => {
    const url = ridePlannerUrl({
      stops: [
        { label: "Mumbai", location: [72.8692, 19.055] },
        { label: "Ratnagiri", location: [73.29544, 16.99335] },
        { label: "Panaji", location: [73.82821, 15.49899] },
      ],
      vehicle: "car",
    });
    const trip = parseTripUrl(new URL(url, "http://x").searchParams);
    expect(trip.from?.label).toBe("Mumbai");
    expect(trip.via.map((s) => s.label)).toEqual(["Ratnagiri"]);
    expect(trip.to?.label).toBe("Panaji");
    expect(trip.vehicle).toBe("car");
  });
});

describe("ride checks", () => {
  const [route] = routeFixture("pollachi-valparai");

  it("measures how far a point is from the route", () => {
    const line = route!.geometry.coordinates as LngLat[];
    expect(distanceToLineM(line, [76.97724, 10.47232])).toBeLessThan(1_500); // Aliyar
    expect(distanceToLineM(line, [77.59, 12.97])).toBeGreaterThan(100_000); // Bengaluru
  });

  it("passes the real Valparai road and flags a wrong one", () => {
    expect(rideProblems(valparai, route!, routeCurvature(route!.geometry))).toEqual([]);
    const wrong: RideSource = {
      ...valparai,
      checkpoints: [{ label: "Munnar", location: [77.06009, 10.087] }],
      expect: { km: 120, hairpinsMin: 60 },
    };
    const problems = rideProblems(wrong, route!, routeCurvature(route!.geometry));
    expect(problems).toHaveLength(3);
    expect(problems[0]).toMatch(/^misses Munnar by \d+\.\d km$/);
  });

  it("keeps the first route option that passes every checkpoint", async () => {
    const [, nh48] = routeFixture("pune-goa");
    const routing = { route: vi.fn(async () => [nh48!, route!]) };
    const built = await buildRide(valparai, { routing, profile: async () => null });
    expect(built.route).toBe(route);
    expect(built.problems).toEqual([]);
    expect(built.curvature.hairpins).toBeGreaterThanOrEqual(30);
    expect(routing.route).toHaveBeenCalledWith({
      waypoints: valparai.stops.map((s) => s.location),
      alternatives: true,
      profile: "bike",
    });
  });
});
