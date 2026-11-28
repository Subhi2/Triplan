import { z } from "zod";
import { RANGE_LIMITS_KM } from "./rideCheck";
import { ENERGY_PRICE_LIMITS, FUEL_PRICE_LIMITS, MILEAGE_LIMITS } from "./tripCost";

// "My bike" (docs/02, "My bike"): the rider's own bike or car as the ride check and trip cost
// use it. Kept in the trip's link and saved trip, so a shared or reopened trip keeps the bike it
// was planned for, and with the rider's account, so a new trip starts from it. Never in browser
// storage. Null fields fall back to the defaults (range) or ask (mileage, fuel price).

export interface MyBike {
  /** Range on a full tank (or a full charge), km. */
  rangeKm: number | null;
  /** Mileage, km per litre (km per kWh when electric). */
  kmPerLitre: number | null;
  /** Fuel price, rupees per litre (rupees per kWh when electric). */
  fuelPrice: number | null;
  /** An electric bike or car (G10): the ride check counts charging points, not pumps. */
  electric: boolean;
}

export const NO_BIKE: MyBike = {
  rangeKm: null,
  kmPerLitre: null,
  fuelPrice: null,
  electric: false,
};

/** The price limits for this kind of bike: per litre, or per kWh when electric. */
export function priceLimits(electric: boolean): { min: number; max: number } {
  return electric ? ENERGY_PRICE_LIMITS : FUEL_PRICE_LIMITS;
}

const within = (limits: { min: number; max: number }) =>
  z.number().min(limits.min).max(limits.max).nullable();

export const myBikeSchema = z
  .object({
    rangeKm: within(RANGE_LIMITS_KM).transform((n) => (n === null ? null : Math.round(n))),
    kmPerLitre: within(MILEAGE_LIMITS),
    fuelPrice: within({ min: ENERGY_PRICE_LIMITS.min, max: FUEL_PRICE_LIMITS.max }),
    // Bikes saved before G10 have no flag: petrol.
    electric: z.boolean().default(false),
  })
  .refine(
    (b) => {
      const limits = priceLimits(b.electric);
      return b.fuelPrice === null || (b.fuelPrice >= limits.min && b.fuelPrice <= limits.max);
    },
    { message: "Price out of range", path: ["fuelPrice"] },
  );

/** Whether any value is set (an empty bike is not written to links or accounts). */
export function hasBike(bike: MyBike | null | undefined): bike is MyBike {
  return (
    !!bike &&
    (bike.rangeKm !== null || bike.kmPerLitre !== null || bike.fuelPrice !== null || bike.electric)
  );
}

/** A field within its limits, or null. */
function readNumber(value: string | null, limits: { min: number; max: number }): number | null {
  if (value === null || value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= limits.min && n <= limits.max ? n : null;
}

/** The bike in a trip link (`rng`, `kpl`, `fp`, `ev=1`), or null when the link has none. */
export function parseMyBike(params: URLSearchParams): MyBike | null {
  const range = readNumber(params.get("rng"), RANGE_LIMITS_KM);
  const electric = params.get("ev") === "1";
  const bike: MyBike = {
    rangeKm: range === null ? null : Math.round(range),
    kmPerLitre: readNumber(params.get("kpl"), MILEAGE_LIMITS),
    fuelPrice: readNumber(params.get("fp"), priceLimits(electric)),
    electric,
  };
  return hasBike(bike) ? bike : null;
}

/** Adds the bike's set values to a trip link. */
export function writeMyBike(params: URLSearchParams, bike: MyBike | null | undefined): void {
  if (!bike) return;
  if (bike.rangeKm !== null) params.set("rng", String(bike.rangeKm));
  if (bike.kmPerLitre !== null) params.set("kpl", String(bike.kmPerLitre));
  if (bike.fuelPrice !== null) params.set("fp", String(bike.fuelPrice));
  if (bike.electric) params.set("ev", "1");
}
