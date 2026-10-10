import { describe, expect, it } from "vitest";
import { categoryStyle } from "@/lib/categories";
import { bestTimeSummary, formatMonthRanges } from "@/lib/months";
import {
  bestAlongRoute,
  detourLabel,
  placesAlongRequestSchema,
  type PlaceAlong,
} from "@/lib/places";

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

describe("bestAlongRoute", () => {
  let n = 0;
  const place = (
    p: Partial<PlaceAlong> & Pick<PlaceAlong, "category" | "kmFromStart">,
  ): PlaceAlong => ({
    id: `p${++n}`,
    slug: `p${n}`,
    name: `Place ${n}`,
    location: [76, 13],
    detourKm: 1,
    rating: null,
    ratingCount: 0,
    bestMonths: [],
    bestMonthsEstimated: false,
    thumbUrl: null,
    trending: false,
    notable: false,
    ...p,
  });

  it("keeps the 5 best places in each 10 km stretch, notable and weighty first", () => {
    const city = [
      place({ category: "attraction", kmFromStart: 1, detourKm: 0.2 }),
      place({ category: "attraction", kmFromStart: 2, detourKm: 0.3 }),
      place({ category: "museum", kmFromStart: 3, detourKm: 0.4 }),
      place({
        category: "museum",
        kmFromStart: 4,
        detourKm: 4.5,
        notable: true,
        name: "Notable museum",
      }),
      place({ category: "heritage", kmFromStart: 5, detourKm: 3 }), // weight 1.2
      place({ category: "lake", kmFromStart: 6, detourKm: 0.1 }),
      place({ category: "attraction", kmFromStart: 7, detourKm: 4.9 }),
      place({ category: "fort", kmFromStart: 8, detourKm: 2, notable: true, name: "Notable fort" }),
    ];
    const rural = place({ category: "waterfall", kmFromStart: 55, detourKm: 4.9 });
    const best = bestAlongRoute([...city, rural]);

    expect(best).toHaveLength(6); // 5 from the city stretch + the lone rural waterfall
    expect(best.map((p) => p.name)).toEqual(
      expect.arrayContaining(["Notable museum", "Notable fort", rural.name]),
    );
    expect(best.find((p) => p.kmFromStart === 7)).toBeUndefined(); // attraction, 4.9 km off
    const kms = best.map((p) => p.kmFromStart);
    expect(kms).toEqual([...kms].sort((a, b) => a - b)); // still ordered by km
  });

  it("keeps everything on a quiet road", () => {
    const quiet = [5, 25, 45, 65].map((km) => place({ category: "viewpoint", kmFromStart: km }));
    expect(bestAlongRoute(quiet)).toEqual(quiet);
  });
});
