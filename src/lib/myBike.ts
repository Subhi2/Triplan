import { z } from "zod";
import { RANGE_LIMITS_KM } from "./rideCheck";
import { FUEL_PRICE_LIMITS, MILEAGE_LIMITS } from "./tripCost";

// "My bike" (docs/02, "My bike"): the rider's own bike or car as the ride check and trip cost
// use it. Kept in the trip's link and saved trip, so a shared or reopened trip keeps the bike it
// was planned for, and with the rider's account, so a new trip starts from it. Never in browser
// storage. Null fields fall back to the defaults (range) or ask (mileage, fuel price).

export interface MyBike {
  /** Range on a full tank, km. */
  rangeKm: number | null;
  /** Mileage, km per litre. */
  kmPerLitre: number | null;
  /** Fuel price, rupees per litre. */
  fuelPrice: number | null;
}

export const NO_BIKE: MyBike = { rangeKm: null, kmPerLitre: null, fuelPrice: null };

const within = (limits: { min: number; max: number }) =>
  z.number().min(limits.min).max(limits.max).nullable();

export const myBikeSchema = z.object({
  rangeKm: within(RANGE_LIMITS_KM).transform((n) => (n === null ? null : Math.round(n))),
  kmPerLitre: within(MILEAGE_LIMITS),
  fuelPrice: within(FUEL_PRICE_LIMITS),
});

/** Whether any value is set (an empty bike is not written to links or accounts). */
export function hasBike(bike: MyBike | null | undefined): bike is MyBike {
  return !!bike && (bike.rangeKm !== null || bike.kmPerLitre !== null || bike.fuelPrice !== null);
}

/** A field within its limits, or null. */
function readNumber(value: string | null, limits: { min: number; max: number }): number | null {
  if (value === null || value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= limits.min && n <= limits.max ? n : null;
}

/** The bike in a trip link (`rng`, `kpl`, `fp`), or null when the link has none. */
export function parseMyBike(params: URLSearchParams): MyBike | null {
  const range = readNumber(params.get("rng"), RANGE_LIMITS_KM);
  const bike: MyBike = {
    rangeKm: range === null ? null : Math.round(range),
    kmPerLitre: readNumber(params.get("kpl"), MILEAGE_LIMITS),
    fuelPrice: readNumber(params.get("fp"), FUEL_PRICE_LIMITS),
  };
  return hasBike(bike) ? bike : null;
}

/** Adds the bike's set values to a trip link. */
export function writeMyBike(params: URLSearchParams, bike: MyBike | null | undefined): void {
  if (!bike) return;
  if (bike.rangeKm !== null) params.set("rng", String(bike.rangeKm));
  if (bike.kmPerLitre !== null) params.set("kpl", String(bike.kmPerLitre));
  if (bike.fuelPrice !== null) params.set("fp", String(bike.fuelPrice));
}
