import { describe, expect, it } from "vitest";
import { hasBike, myBikeSchema, NO_BIKE, parseMyBike, writeMyBike } from "@/lib/myBike";
import { parseTripUrl, serializeTripUrl } from "@/lib/tripUrl";

const TRIP = "from=Bengaluru@77.5946,12.9716&to=Kalasa@75.356,13.234&v=bike&c=5";

describe("My bike in a trip link", () => {
  it("round-trips through the trip link", () => {
    const trip = parseTripUrl(new URLSearchParams(`${TRIP}&rng=220&kpl=35.5&fp=104.5`));
    expect(trip.myBike).toEqual({
      rangeKm: 220,
      kmPerLitre: 35.5,
      fuelPrice: 104.5,
      electric: false,
    });
    const again = parseTripUrl(new URLSearchParams(serializeTripUrl(trip)));
    expect(again.myBike).toEqual(trip.myBike);
  });

  it("keeps only the values within their limits", () => {
    // 20 km is under the range limit, 500 a litre over the price limit.
    expect(parseMyBike(new URLSearchParams("rng=20&kpl=40&fp=500"))).toEqual({
      rangeKm: null,
      kmPerLitre: 40,
      fuelPrice: null,
      electric: false,
    });
    expect(parseMyBike(new URLSearchParams("rng=abc&kpl=&fp=-3"))).toBeNull();
  });

  it("leaves links without a bike as they were", () => {
    const trip = parseTripUrl(new URLSearchParams(TRIP));
    expect(trip).not.toHaveProperty("myBike");
    expect(serializeTripUrl(trip)).not.toMatch(/rng|kpl|fp=/);
  });

  it("writes only the values that are set", () => {
    const params = new URLSearchParams();
    writeMyBike(params, { ...NO_BIKE, kmPerLitre: 18 });
    expect(params.toString()).toBe("kpl=18");
    expect(hasBike(NO_BIKE)).toBe(false);
    expect(hasBike({ ...NO_BIKE, fuelPrice: 100 })).toBe(true);
  });

  it("rounds the range to whole km and refuses values out of bounds", () => {
    expect(myBikeSchema.parse({ rangeKm: 219.6, kmPerLitre: null, fuelPrice: null }).rangeKm).toBe(
      220,
    );
    expect(
      myBikeSchema.safeParse({ rangeKm: 5000, kmPerLitre: null, fuelPrice: null }).success,
    ).toBe(false);
  });

  it("keeps an electric bike, priced per kWh (G10)", () => {
    const trip = parseTripUrl(new URLSearchParams(`${TRIP}&rng=110&kpl=30&fp=9&ev=1`));
    expect(trip.myBike).toEqual({ rangeKm: 110, kmPerLitre: 30, fuelPrice: 9, electric: true });
    expect(serializeTripUrl(trip)).toContain("ev=1");
    // ₹9 is a charging price, not a petrol one.
    expect(parseMyBike(new URLSearchParams("fp=9"))).toBeNull();
    expect(myBikeSchema.safeParse({ ...NO_BIKE, fuelPrice: 9 }).success).toBe(false);
    expect(myBikeSchema.safeParse({ ...NO_BIKE, fuelPrice: 9, electric: true }).success).toBe(true);
    expect(hasBike({ ...NO_BIKE, electric: true })).toBe(true);
    // Bikes saved before G10 have no flag.
    expect(myBikeSchema.parse({ rangeKm: 200, kmPerLitre: null, fuelPrice: null }).electric).toBe(
      false,
    );
  });
});
