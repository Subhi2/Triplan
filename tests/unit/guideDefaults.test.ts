import { describe, expect, it } from "vitest";
import {
  climateZone,
  estimateBestMonths,
  estimateGuide,
  parseElevation,
} from "@/lib/guideDefaults";

// Real places on different routes: the zone comes from coordinates alone, for any trip.
const HANUMAN_GUNDI: [number, number] = [75.2585, 13.1878]; // Western Ghats, near Kalasa
const MYSURU: [number, number] = [76.6394, 12.3052];
const MAHABALIPURAM: [number, number] = [80.1934, 12.6208];
const LEH: [number, number] = [77.5771, 34.1526];
const KHARDUNG_LA: [number, number] = [77.6033, 34.2788];
const SHIMLA: [number, number] = [77.1734, 31.1048];
const JAISALMER: [number, number] = [70.9083, 26.9157];
const AGRA: [number, number] = [78.0081, 27.1767];
const SHILLONG: [number, number] = [91.8933, 25.5788];
const LONAVALA: [number, number] = [73.4071, 18.7546];

describe("climateZone", () => {
  it("places points in their climate from coordinates", () => {
    expect(climateZone(HANUMAN_GUNDI)).toBe("west-coast");
    expect(climateZone(LONAVALA)).toBe("west-coast");
    expect(climateZone(MYSURU)).toBe("deccan");
    expect(climateZone(MAHABALIPURAM)).toBe("south-east");
    expect(climateZone(LEH)).toBe("high-himalaya");
    expect(climateZone(SHIMLA)).toBe("himalaya");
    expect(climateZone(JAISALMER)).toBe("thar");
    expect(climateZone(AGRA)).toBe("north-plains");
    expect(climateZone(SHILLONG)).toBe("north-east");
  });

  it("moves high places up a zone when their height is known", () => {
    expect(climateZone(SHIMLA, 3500)).toBe("high-himalaya");
    expect(climateZone([79.0, 32.5], 2000)).toBe("himalaya");
  });
});

describe("estimateGuide", () => {
  it("matches the curated waterfall near Kalasa: best Aug–Nov, carry grip shoes and leech socks", () => {
    const e = estimateGuide({ category: "waterfall", location: HANUMAN_GUNDI })!;
    expect(e.guide.bestMonths).toEqual([8, 9, 10, 11]);
    expect(e.guide.avoidMonths).toEqual([4, 5]);
    expect(e.carry.map((c) => c.slug)).toEqual(
      expect.arrayContaining(["grip_shoes", "leech_socks", "raincoat"]),
    );
    expect(e.basis).toBe("Typical for waterfalls in the Western Ghats and the west coast");
  });

  it("keeps temples in the Ghats to the cool months, with modest clothing", () => {
    const e = estimateGuide({ category: "temple", location: [75.356, 13.234] })!;
    expect(e.guide.bestMonths).toEqual([10, 11, 12, 1, 2]);
    expect(e.carry[0]).toMatchObject({ slug: "modest_clothing", name: "Modest clothing" });
  });

  it("opens high passes only in summer, with warm layers all year", () => {
    const e = estimateGuide({ category: "pass", location: KHARDUNG_LA, elevationM: 5359 })!;
    expect(e.guide.bestMonths).toEqual([6, 7, 8, 9]);
    expect(e.guide.avoidMonths).toEqual([11, 12, 1, 2, 3, 4]);
    expect(e.guide.okMonths).toEqual([5, 10]);
    expect(e.guide.bestVehicles).toEqual(["bike", "suv_4x4"]);
    expect(e.carry.slice(0, 2)).toEqual([
      { slug: "jacket", name: "Jacket", months: [], reason: null },
      { slug: "gloves", name: "Gloves", months: [], reason: null },
    ]);
  });

  it("keeps beaches on the south-east coast out of the north-east monsoon", () => {
    const e = estimateGuide({ category: "beach", location: MAHABALIPURAM })!;
    expect(e.guide.avoidMonths).toEqual([10, 11, 12]);
    expect(e.guide.bestMonths).toEqual([1, 2, 3]);
  });

  it("avoids the desert heat for forts in the Thar", () => {
    const e = estimateGuide({ category: "fort", location: JAISALMER })!;
    expect(e.guide.avoidMonths).toEqual([4, 5, 6]);
    expect(e.carry.map((c) => c.slug)).toContain("cap");
  });

  it("rates every month once, and never estimates towns or fuel stations", () => {
    const { guide } = estimateGuide({ category: "trek", location: SHIMLA })!;
    const all = [...guide.bestMonths, ...guide.okMonths, ...guide.avoidMonths].sort(
      (a, b) => a - b,
    );
    expect(all).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(estimateGuide({ category: "town", location: AGRA })).toBeNull();
    expect(estimateBestMonths("fuel", AGRA)).toEqual([]);
  });

  it("lists at most six items to carry, without repeats", () => {
    for (const category of ["trek", "pass", "waterfall", "wildlife", "temple", "beach", "museum"]) {
      for (const location of [HANUMAN_GUNDI, LEH, AGRA, SHILLONG]) {
        const carry = estimateGuide({ category, location })!.carry;
        expect(carry.length).toBeLessThanOrEqual(6);
        expect(new Set(carry.map((c) => c.slug)).size).toBe(carry.length);
      }
    }
  });
});

describe("parseElevation", () => {
  it("reads OSM's ele tag", () => {
    expect(parseElevation("1930")).toBe(1930);
    expect(parseElevation("5359 m")).toBe(5359);
    expect(parseElevation("about 2000")).toBeNull();
    expect(parseElevation(undefined)).toBeNull();
  });
});
