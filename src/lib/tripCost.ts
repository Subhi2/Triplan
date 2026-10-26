import type { Vehicle } from "./trip";

// Trip cost (docs/02, "Breaks, sunset stop, tolls and helplines"): km ÷ mileage × fuel price,
// from values the rider types. We publish no fuel prices and no toll amounts.

/** Mileage the form accepts, in km per litre. */
export const MILEAGE_LIMITS = { min: 3, max: 120 } as const;
/** Fuel price the form accepts, in rupees per litre. */
export const FUEL_PRICE_LIMITS = { min: 30, max: 300 } as const;

/** The FASTag annual pass for private cars (NHAI, from 15 August 2025). */
export const FASTAG_PASS = { rupees: 3000, crossings: 200 } as const;

export const mileageKey = (v: Vehicle) => `trip-cost-mileage-${v}`;
export const fuelPriceKey = (v: Vehicle) => `trip-cost-price-${v}`;

/** A number typed into the form, or null when it is empty or outside the limits. */
export function parseWithin(text: string, limits: { min: number; max: number }): number | null {
  if (text.trim() === "") return null;
  const n = Number(text);
  return Number.isFinite(n) && n >= limits.min && n <= limits.max ? n : null;
}

export interface FuelCost {
  litres: number; // one decimal
  rupees: number; // to the nearest ₹10
}

export function fuelCost(km: number, kmPerLitre: number, pricePerLitre: number): FuelCost | null {
  if (!(km > 0) || !(kmPerLitre > 0) || !(pricePerLitre > 0)) return null;
  const litres = km / kmPerLitre;
  return {
    litres: Math.round(litres * 10) / 10,
    rupees: Math.round((litres * pricePerLitre) / 10) * 10,
  };
}

/** "₹2,340": Indian digit grouping. */
export function formatRupees(rupees: number): string {
  return `₹${Math.round(rupees).toLocaleString("en-IN")}`;
}
