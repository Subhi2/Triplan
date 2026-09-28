import { describe, expect, it } from "vitest";
import { categoryStyle } from "@/lib/categories";
import { bestTimeSummary, formatMonthRanges } from "@/lib/months";
import { detourLabel, placesAlongRequestSchema } from "@/lib/places";

describe("formatMonthRanges", () => {
  it("joins consecutive months, including across the new year", () => {
    expect(formatMonthRanges([10, 11, 12, 1, 2])).toBe("Oct–Feb");
    expect(formatMonthRanges([8, 9, 10, 11, 12, 1])).toBe("Aug–Jan");
    expect(formatMonthRanges([7, 8, 9, 10])).toBe("Jul–Oct");
  });

  it("lists separate runs and single months", () => {
    expect(formatMonthRanges([3, 1, 7, 8])).toBe("Jan, Mar, Jul–Aug");
    expect(formatMonthRanges([12, 1, 5])).toBe("May, Dec–Jan");
  });

  it("handles all year, empty and invalid input", () => {
    expect(formatMonthRanges([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])).toBe("All year");
    expect(formatMonthRanges([])).toBe("");
    expect(formatMonthRanges([0, 13, 2.5])).toBe("");
  });

  it("summarises best months, saying when they are unknown", () => {
    expect(bestTimeSummary([10, 11, 12, 1, 2])).toBe("Best Oct–Feb");
    expect(bestTimeSummary([])).toBe("Best time not known yet");
  });
});

describe("detourLabel", () => {
  it("calls places within 0.5 km on route and flags the rest", () => {
    expect(detourLabel(0.06)).toBe("On route");
    expect(detourLabel(0.5)).toBe("On route");
    expect(detourLabel(1.56)).toBe("+1.6 km detour");
    expect(detourLabel(7.19)).toBe("+7.2 km detour");
  });
});

describe("categoryStyle", () => {
  it("knows seeded categories and falls back for new ones", () => {
    expect(categoryStyle("waterfall").name).toBe("Waterfall");
    expect(categoryStyle("hot_spring")).toEqual({ name: "Hot spring", color: "#64748b" });
  });
});

describe("placesAlongRequestSchema", () => {
  const line = {
    type: "LineString",
    coordinates: [
      [77.59, 12.97],
      [75.36, 13.23],
    ],
  };

  it("accepts a route id or a geometry with an allowed corridor", () => {
    expect(
      placesAlongRequestSchema.safeParse({ routeId: `${"a".repeat(32)}-1`, corridorKm: 5 }).success,
    ).toBe(true);
    expect(placesAlongRequestSchema.safeParse({ geometry: line, corridorKm: 25 }).success).toBe(
      true,
    );
  });

  it("rejects missing route, bad corridor, bad ids and bad categories", () => {
    expect(placesAlongRequestSchema.safeParse({ corridorKm: 5 }).success).toBe(false);
    expect(placesAlongRequestSchema.safeParse({ geometry: line, corridorKm: 7 }).success).toBe(
      false,
    );
    expect(placesAlongRequestSchema.safeParse({ routeId: "abc", corridorKm: 5 }).success).toBe(
      false,
    );
    expect(
      placesAlongRequestSchema.safeParse({ geometry: line, corridorKm: 5, categories: ["x'); --"] })
        .success,
    ).toBe(false);
  });
});
