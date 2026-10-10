import type { CategorySlug } from "@/lib/categories";
import { haversineM, type LngLat } from "@/lib/geo";
import type { WikidataItem } from "../providers/wikimedia";

// OpenStreetMap's wikidata tag is sometimes wrong for us: on a memorial it names the person
// (Shakti Sthal -> Indira Gandhi, whose photo is a portrait), and some tags point at another place
// altogether (a Singapore temple on six places in Kushinagar). An item is used for a place's photo
// or text only when it is not a person and, when it has coordinates, lies near the place.

/** How far the item may lie from our point: big places have their point far from the item's. */
const MAX_OFF_M: Partial<Record<CategorySlug, number>> = {
  wildlife: 30_000,
  trek: 20_000,
  lake: 10_000,
  beach: 10_000,
  town: 5_000,
  peak: 5_000,
  pass: 5_000,
};
const DEFAULT_MAX_OFF_M = 2_000;

export function wikidataFits(
  place: { location: LngLat; category: string },
  item: WikidataItem,
): boolean {
  if (item.human) return false;
  if (!item.location) return true;
  const max = MAX_OFF_M[place.category as CategorySlug] ?? DEFAULT_MAX_OFF_M;
  return haversineM(place.location, item.location) <= max;
}
