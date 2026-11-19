import { describe, expect, it } from "vitest";
import { rideInList } from "@/lib/rideLists";

const base = {
  region: "Karnataka",
  tags: [] as string[],
  distanceKm: 200,
  hairpins: 0,
  highestM: 500 as number | null,
};
const ride = (o: Partial<typeof base>) => ({ ...base, ...o });

describe("rideInList", () => {
  it("puts Himalayan states, Bengal hills and high northern roads in Himalaya", () => {
    expect(rideInList(ride({ region: "Ladakh" }), "himalaya")).toBe(true);
    expect(rideInList(ride({ region: "West Bengal and Sikkim" }), "himalaya")).toBe(true);
    expect(rideInList(ride({ region: "West Bengal", highestM: 2100 }), "himalaya")).toBe(true);
    expect(rideInList(ride({ region: "West Bengal", highestM: 20 }), "himalaya")).toBe(false);
    expect(rideInList(ride({ region: "Karnataka", highestM: 1800 }), "himalaya")).toBe(false);
  });

  it("uses the stored numbers for passes, hairpins, easy and long rides", () => {
    expect(rideInList(ride({ highestM: 3600 }), "high-passes")).toBe(true);
    expect(rideInList(ride({ highestM: 3400 }), "high-passes")).toBe(false);
    expect(rideInList(ride({ highestM: null }), "high-passes")).toBe(false);
    expect(rideInList(ride({ hairpins: 20 }), "hairpins")).toBe(true);
    expect(rideInList(ride({ hairpins: 19 }), "hairpins")).toBe(false);
    expect(rideInList(ride({ distanceKm: 100 }), "easy")).toBe(true);
    expect(rideInList(ride({ distanceKm: 100, hairpins: 11 }), "easy")).toBe(false);
    expect(rideInList(ride({ distanceKm: 100, highestM: 3000 }), "easy")).toBe(false);
    expect(rideInList(ride({ distanceKm: 300 }), "long")).toBe(true);
    expect(rideInList(ride({ distanceKm: 299 }), "long")).toBe(false);
  });

  it("finds coast rides by their tags", () => {
    expect(rideInList(ride({ tags: ["Konkan coast", "sea fort"] }), "coast")).toBe(true);
    expect(rideInList(ride({ tags: ["coffee country"] }), "coast")).toBe(false);
    expect(rideInList(ride({ tags: ["Western Ghats"] }), "coast")).toBe(false);
  });
});
