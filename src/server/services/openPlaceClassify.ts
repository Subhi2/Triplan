import type { LngLat } from "@/lib/geo";
import type { OpenPlaceRecord } from "../providers/openPlaces";

// Which open places we take (docs/02, "Open places from Overture"): fuel, food and coffee with a
// confidence of 0.7 or more, not known to be closed. Pure, so it is easy to test. Stays are left
// out: the spike found many eateries filed as hotels and booking-site listings, and OpenStreetMap
// already gives us 27,000 stays.

export type OpenPlaceCategory = "fuel" | "food" | "coffee";

/** Overture's basic categories, by our category. Bars, breweries and travel agents stay out. */
export const OPEN_PLACE_CATEGORIES: Record<OpenPlaceCategory, readonly string[]> = {
  fuel: ["gas_station", "fueling_station"],
  food: ["restaurant", "casual_eatery", "fast_food_restaurant", "food_court"],
  // Tea stalls are "non_alcoholic_beverage_venue": the same kind of break as coffee.
  coffee: ["coffee_shop", "cafe", "non_alcoholic_beverage_venue"],
};

export const OPEN_PLACE_BASIC_CATEGORIES = Object.values(OPEN_PLACE_CATEGORIES).flat();

export const MIN_OPEN_PLACE_CONFIDENCE = 0.7;

const CATEGORY_OF = new Map(
  (Object.entries(OPEN_PLACE_CATEGORIES) as [OpenPlaceCategory, readonly string[]][]).flatMap(
    ([ours, theirs]) => theirs.map((t) => [t, ours] as const),
  ),
);

/** Licences that allow commercial use and storing; a record with any other is skipped. */
const ALLOWED_LICENSES = new Set(["CDLA-Permissive-2.0", "Apache-2.0", "CC0-1.0"]);

export interface OpenPlaceCandidate {
  externalId: string;
  name: string;
  category: OpenPlaceCategory;
  location: LngLat;
  confidence: number;
  /** The record's licences, for example "Apache-2.0" or "CDLA-Permissive-2.0, CC0-1.0". */
  license: string;
  /** The datasets behind the record ("Foursquare", "meta"), credited on About. */
  datasets: string[];
}

/** "Pizza Hut | Hirabaug, Pune" → "Pizza Hut": the branch after a bar is not part of the name. */
export function cleanOpenPlaceName(name: string): string {
  return name
    .split(/\s+[|·]\s+/)[0]!
    .replace(/\s+/g, " ")
    .trim();
}

/** A website for a name ("gonative.live"), or a listing number ("Store 40217"). */
const NOT_A_NAME = /^[\w-]+(\.[a-z]{2,})+$|\d{4,}/i;

/** One of our categories, or why the record is skipped. */
export function classifyOpenPlace(
  r: OpenPlaceRecord,
  minConfidence = MIN_OPEN_PLACE_CONFIDENCE,
): OpenPlaceCandidate | { skip: "category" | "confidence" | "closed" | "name" | "license" } {
  const category = CATEGORY_OF.get(r.basicCategory);
  if (!category) return { skip: "category" };
  if (r.confidence === null || r.confidence < minConfidence) return { skip: "confidence" };
  if (r.operatingStatus !== null && r.operatingStatus !== "open") return { skip: "closed" };
  const name = cleanOpenPlaceName(r.name);
  // A name that is only digits or punctuation, or a long advert, is not a place name.
  if (!/\p{L}/u.test(name) || name.length > 60 || NOT_A_NAME.test(name)) return { skip: "name" };
  if (r.licenses.length === 0 || r.licenses.some((l) => !ALLOWED_LICENSES.has(l))) {
    return { skip: "license" };
  }
  return {
    externalId: r.id,
    name,
    category,
    location: [r.lng, r.lat],
    confidence: r.confidence,
    license: [...r.licenses].sort().join(", "),
    datasets: [...r.datasets].sort(),
  };
}

export function isOpenPlaceCandidate(
  c: ReturnType<typeof classifyOpenPlace>,
): c is OpenPlaceCandidate {
  return !("skip" in c);
}
