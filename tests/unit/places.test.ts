import { describe, expect, it } from "vitest";
import { categoryStyle } from "@/lib/categories";
import { bestTimeSummary, formatMonthRanges } from "@/lib/months";
import {
  bestAlongRoute,
  worthStop,
  detourLabel,
  placesAlongRequestSchema,
  popularity,
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

  it("keeps the 3 best places worth a stop in each 10 km stretch, notable and weighty first", () => {
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

    // City stretch: only the notable museum, notable fort and the heritage site are worth a stop.
    expect(best).toHaveLength(4); // 3 from the city stretch + the lone rural waterfall
    expect(best.map((p) => p.name)).toEqual(
      expect.arrayContaining(["Notable museum", "Notable fort", rural.name]),
    );
    expect(best.find((p) => p.kmFromStart === 7)).toBeUndefined(); // unknown attraction
    expect(best.find((p) => p.category === "lake")).toBeUndefined(); // unknown village tank
    const kms = best.map((p) => p.kmFromStart);
    expect(kms).toEqual([...kms].sort((a, b) => a - b)); // still ordered by km
  });

  it("keeps everything worth a stop on a quiet road", () => {
    const quiet = [5, 25, 45, 65].map((km) => place({ category: "viewpoint", kmFromStart: km }));
    expect(bestAlongRoute(quiet)).toEqual(quiet);
  });

  it("leaves a stretch of unknown roadside temples empty", () => {
    const temples = [11, 12, 13].map((km) => place({ category: "temple", kmFromStart: km }));
    const known = place({ category: "temple", kmFromStart: 14, ratingCount: 3 });
    expect(bestAlongRoute([...temples, known])).toEqual([known]);
  });

  it("lists one sight once when it is mapped twice", () => {
    const fall = place({ category: "waterfall", kmFromStart: 396, name: "Amboli waterfalls" });
    const twin = place({ category: "waterfall", kmFromStart: 398, name: "Amboli Waterfall" });
    const peak = place({ category: "peak", kmFromStart: 54, name: "Nijagal Betta" });
    const trek = place({ category: "trek", kmFromStart: 54, name: "Nijagal Betta Trek" });
    const far = place({ category: "waterfall", kmFromStart: 420, name: "Amboli Waterfall" });
    const best = bestAlongRoute([peak, trek, fall, twin, far]);
    expect(best.map((p) => p.kmFromStart)).toEqual([54, 396, 420]);
  });

  it("knows which places are worth a stop", () => {
    expect(worthStop(place({ category: "temple", kmFromStart: 1 }))).toBe(false);
    expect(worthStop(place({ category: "temple", kmFromStart: 1, notable: true }))).toBe(true);
    expect(worthStop(place({ category: "lake", kmFromStart: 1, thumbUrl: "x.jpg" }))).toBe(true);
    expect(worthStop(place({ category: "viewpoint", kmFromStart: 1 }))).toBe(true);
    expect(worthStop(place({ category: "food", kmFromStart: 1, ratingCount: 2 }))).toBe(false);
  });

  describe("Popular ↔ Offbeat", () => {
    // Famous temples and little-known viewpoints, one per stretch so the cap stays out of it.
    const famous = [1, 11, 21, 31].map((km) =>
      place({
        category: "temple",
        kmFromStart: km,
        notable: true,
        thumbUrl: "https://upload.wikimedia.org/x.jpg",
        ratingCount: 40,
        name: `Famous ${km}`,
      }),
    );
    const quiet = [5, 15, 25, 35].map((km) =>
      place({ category: "viewpoint", kmFromStart: km, name: `Quiet ${km}` }),
    );
    const names = (mix: "popular" | "mixed" | "offbeat") =>
      bestAlongRoute([...famous, ...quiet], mix).map((p) => p.name);

    it("Popular keeps only the well-known places", () => {
      expect(names("popular")).toEqual(["Famous 1", "Famous 11", "Famous 21", "Famous 31"]);
    });

    it("Offbeat keeps only the little-known places", () => {
      expect(names("offbeat")).toEqual(["Quiet 5", "Quiet 15", "Quiet 25", "Quiet 35"]);
    });

    it("Popular puts the best known first in a crowded stretch", () => {
      const crowd = [2, 3, 4].map((km) =>
        place({
          category: "temple",
          kmFromStart: km,
          notable: true,
          thumbUrl: "https://upload.wikimedia.org/x.jpg",
          ratingCount: 40,
          name: `Famous ${km}`,
        }),
      );
      const more = [7, 8, 9].map((km) =>
        place({ category: "temple", kmFromStart: km, notable: true, name: `Notable ${km}` }),
      );
      // 6 well-known places in km 0–10, 3 kept: those with photos and reviews beat notable only.
      const popular = bestAlongRoute([...crowd, ...more], "popular").map((p) => p.name);
      expect(popular).toEqual(["Famous 2", "Famous 3", "Famous 4"]);
    });

    it("Mixed is the default order", () => {
      expect(names("mixed")).toEqual(bestAlongRoute([...famous, ...quiet]).map((p) => p.name));
    });

    it("scores popularity from notable, photo, reviews and trending", () => {
      expect(popularity(famous[0]!)).toBe(2.5);
      expect(popularity(quiet[0]!)).toBe(0);
      expect(popularity({ ...quiet[0]!, trending: true, ratingCount: 10 })).toBe(1);
    });
  });
});
