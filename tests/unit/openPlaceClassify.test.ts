import { describe, expect, it } from "vitest";
import type { OpenPlaceRecord } from "@/server/providers/openPlaces";
import {
  classifyOpenPlace,
  cleanOpenPlaceName,
  OPEN_PLACE_BASIC_CATEGORIES,
} from "@/server/services/openPlaceClassify";

// Records shaped like Overture's, from the spike on Bengaluru → Kalasa and Pune → Goa.
const record = (over: Partial<OpenPlaceRecord>): OpenPlaceRecord => ({
  id: "08f61a1b2c3d4e5f0123456789abcdef",
  name: "Hindustan Petroleum",
  lng: 77.08958,
  lat: 13.31673,
  confidence: 0.95,
  basicCategory: "gas_station",
  detailCategory: "gas_station",
  datasets: ["Overture", "AllThePlaces"],
  licenses: ["CC0-1.0", "CDLA-Permissive-2.0"],
  operatingStatus: "open",
  locality: "Maralur",
  website: null,
  ...over,
});

describe("classifyOpenPlace", () => {
  it("maps Overture's categories to fuel, food and coffee", () => {
    expect(classifyOpenPlace(record({}))).toMatchObject({
      category: "fuel",
      location: [77.08958, 13.31673],
      license: "CC0-1.0, CDLA-Permissive-2.0",
      datasets: ["AllThePlaces", "Overture"],
    });
    expect(classifyOpenPlace(record({ basicCategory: "fueling_station" }))).toMatchObject({
      category: "fuel",
    });
    expect(classifyOpenPlace(record({ basicCategory: "casual_eatery" }))).toMatchObject({
      category: "food",
    });
    expect(
      classifyOpenPlace(record({ basicCategory: "non_alcoholic_beverage_venue" })),
    ).toMatchObject({ category: "coffee" });
  });

  it("leaves out stays, bars and everything else", () => {
    for (const basicCategory of ["hotel", "resort", "bar", "brewery", "travel_service"]) {
      expect(classifyOpenPlace(record({ basicCategory }))).toEqual({ skip: "category" });
    }
    expect(OPEN_PLACE_BASIC_CATEGORIES).not.toContain("hotel");
  });

  it("needs a confidence of 0.7 and a place not known to be closed", () => {
    expect(classifyOpenPlace(record({ confidence: 0.69 }))).toEqual({ skip: "confidence" });
    expect(classifyOpenPlace(record({ confidence: null }))).toEqual({ skip: "confidence" });
    expect(classifyOpenPlace(record({ confidence: 0.69 }), 0.5)).toMatchObject({
      category: "fuel",
    });
    expect(classifyOpenPlace(record({ operatingStatus: "permanently_closed" }))).toEqual({
      skip: "closed",
    });
    expect(classifyOpenPlace(record({ operatingStatus: null }))).toMatchObject({
      category: "fuel",
    });
  });

  it("skips names that are a website, a listing number or an advert", () => {
    for (const name of ["gonative.live", "Store 40217", "1234", "---", "x".repeat(61)]) {
      expect(classifyOpenPlace(record({ name }))).toEqual({ skip: "name" });
    }
    expect(classifyOpenPlace(record({ name: "Goli Vada Pav No. 1" }))).toMatchObject({
      name: "Goli Vada Pav No. 1",
    });
  });

  it("takes only licences that allow storing and commercial use", () => {
    expect(classifyOpenPlace(record({ licenses: ["Apache-2.0"] }))).toMatchObject({
      license: "Apache-2.0",
    });
    expect(classifyOpenPlace(record({ licenses: ["CC-BY-NC-4.0"] }))).toEqual({ skip: "license" });
    expect(classifyOpenPlace(record({ licenses: ["Apache-2.0", "ODbL-1.0"] }))).toEqual({
      skip: "license",
    });
    expect(classifyOpenPlace(record({ licenses: [] }))).toEqual({ skip: "license" });
  });
});

describe("cleanOpenPlaceName", () => {
  it("drops the branch after a bar and extra spaces", () => {
    expect(cleanOpenPlaceName("Pizza Hut | Hirabaug, Pune")).toBe("Pizza Hut");
    expect(cleanOpenPlaceName("  Café  Coffee Day · MG Road ")).toBe("Café Coffee Day");
    expect(cleanOpenPlaceName("A|B")).toBe("A|B");
  });
});
