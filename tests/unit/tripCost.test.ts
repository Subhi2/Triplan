import { describe, expect, it } from "vitest";
import { tollPlazas } from "@/lib/safety";
import {
  FUEL_PRICE_LIMITS,
  formatRupees,
  fuelCost,
  MILEAGE_LIMITS,
  parseWithin,
} from "@/lib/tripCost";

describe("fuelCost", () => {
  it("is km ÷ mileage × price, to the nearest ₹10", () => {
    // 312 km at 35 km/l is 8.9 l; at ₹103 a litre, ₹918.
    expect(fuelCost(312, 35, 103)).toEqual({ litres: 8.9, rupees: 920 });
  });

  it("needs a distance, a mileage and a price", () => {
    expect(fuelCost(0, 35, 103)).toBeNull();
    expect(fuelCost(312, 0, 103)).toBeNull();
    expect(fuelCost(312, 35, Number.NaN)).toBeNull();
  });
});

describe("parseWithin", () => {
  it("takes numbers inside the limits only", () => {
    expect(parseWithin("35", MILEAGE_LIMITS)).toBe(35);
    expect(parseWithin("", MILEAGE_LIMITS)).toBeNull();
    expect(parseWithin("1", MILEAGE_LIMITS)).toBeNull();
    expect(parseWithin("abc", FUEL_PRICE_LIMITS)).toBeNull();
    expect(parseWithin("102.9", FUEL_PRICE_LIMITS)).toBe(102.9);
  });
});

describe("formatRupees", () => {
  it("groups digits the Indian way", () => {
    expect(formatRupees(123456)).toBe("₹1,23,456");
  });
});

describe("tollPlazas", () => {
  const booth = (id: string, km: number, name: string | null = null) => ({
    id,
    name,
    location: [76.5, 13] as [number, number],
    kmFromStart: km,
  });

  it("counts the booths on each carriageway of a plaza once", () => {
    const plazas = tollPlazas([
      booth("node/3", 141.2, "Shanthigrama Toll Plaza"),
      booth("node/1", 40.1),
      booth("node/2", 40.4, "Nelamangala Toll Plaza"),
      booth("node/4", 141.6),
    ]);
    expect(plazas.map((p) => [p.id, p.name, p.kmFromStart])).toEqual([
      ["node/1", "Nelamangala Toll Plaza", 40.1],
      ["node/3", "Shanthigrama Toll Plaza", 141.2],
    ]);
  });
});
