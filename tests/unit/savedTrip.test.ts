import { describe, expect, it } from "vitest";
import {
  createTripSchema,
  isSavedPlan,
  updateTripSchema,
  type SavedTrip,
  type TripPlan,
} from "@/lib/savedTrip";

const plan: TripPlan = {
  stops: [
    { label: "Bengaluru", location: [77.594612, 12.971598] },
    { label: "Manjarabad Fort", location: [75.7581, 12.9173] },
    { label: "Kalasa", location: [75.356, 13.234] },
  ],
  vehicle: "bike",
  corridorKm: 5,
  route: {
    id: `${"a".repeat(32)}-0`,
    geometry: {
      type: "LineString",
      coordinates: [
        [77.5946, 12.9716],
        [75.356, 13.234],
      ],
    },
    distanceKm: 330.8,
    durationMin: 402,
    viaLabel: "via Sakleshpur",
  },
};

const saved: SavedTrip = {
  id: "0b7e4b8e-2f4e-4c55-9d8e-3f1f5b0a9c11",
  title: "Coffee country",
  vehicle: "bike",
  corridorKm: 5,
  // As read back from the URL: rounded to 5 decimals.
  stops: [
    { label: "Bengaluru", location: [77.59461, 12.9716] },
    { label: "Manjarabad Fort", location: [75.7581, 12.9173] },
    { label: "Kalasa", location: [75.356, 13.234] },
  ],
  routeId: plan.route.id,
  viaLabel: "via Sakleshpur",
  distanceKm: 330.8,
  durationMin: 402,
  updatedAt: "2026-09-29T07:00:00.000Z",
};

describe("saved trip requests", () => {
  it("accepts a trip to save", () => {
    const parsed = createTripSchema.parse({ title: "  Coffee country ", ...plan });
    expect(parsed.title).toBe("Coffee country");
  });

  it("rejects bad trips", () => {
    for (const bad of [
      { ...plan, title: "" },
      { ...plan, title: "x".repeat(121) },
      { ...plan, title: "t", corridorKm: 7 },
      { ...plan, title: "t", stops: plan.stops.slice(0, 1) },
      { ...plan, title: "t", route: { ...plan.route, geometry: { type: "Point" } } },
    ]) {
      expect(createTripSchema.safeParse(bad).success).toBe(false);
    }
  });

  it("updates need a title or a plan", () => {
    expect(updateTripSchema.safeParse({}).success).toBe(false);
    expect(updateTripSchema.safeParse({ title: "New name" }).success).toBe(true);
    expect(updateTripSchema.safeParse({ plan }).success).toBe(true);
  });
});

describe("isSavedPlan", () => {
  it("matches the saved trip despite URL rounding", () => {
    expect(isSavedPlan(saved, plan)).toBe(true);
  });

  it("notices changes", () => {
    const changes: TripPlan[] = [
      { ...plan, stops: [plan.stops[0]!, plan.stops[2]!] },
      { ...plan, vehicle: "car" },
      { ...plan, corridorKm: 10 },
      { ...plan, route: { ...plan.route, id: `${"a".repeat(32)}-1` } },
    ];
    for (const changed of changes) expect(isSavedPlan(saved, changed)).toBe(false);
  });
});
