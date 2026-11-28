import { sql } from "drizzle-orm";
import { CARRY_ITEMS, type CarrySlug } from "@/lib/carryItems";
import type { LngLat } from "@/lib/geo";
import { estimateGuide, parseElevation } from "@/lib/guideDefaults";
import type { PackingItem } from "@/lib/packing";
import { getDb } from "../db";

// The packing list for a trip (G10, C3): what the places on it say to carry in the month of the
// ride (curated, else estimated as on their pages), and what every ride needs.

/** Always on the list for a ride, whatever the places. */
const RIDE_BASICS: CarrySlug[] = ["water_2l", "cash", "power_bank", "first_aid"];

interface PlaceRow extends Record<string, unknown> {
  id: string;
  name: string;
  category: string;
  lng: number;
  lat: number;
  ele: string | null;
}

interface CarryRow extends Record<string, unknown> {
  place_id: string;
  slug: string;
  months: number[];
}

const needed = (months: number[], month: number) => months.length === 0 || months.includes(month);

/**
 * Items for the places with these ids and the trip's end, needed in `month` (1–12): each with the
 * places that ask for it, ride basics first.
 */
export async function packingFor(
  placeIds: string[],
  month: number,
  destination: LngLat,
): Promise<PackingItem[]> {
  const db = getDb();
  const places = placeIds.length
    ? await db.execute<PlaceRow>(sql`
        SELECT p.id, p.name, c.slug AS category, ST_X(p.location::geometry) AS lng,
               ST_Y(p.location::geometry) AS lat, p.osm_tags->>'ele' AS ele
        FROM place p JOIN category c ON c.id = p.category_id
        WHERE p.id = ANY(${sql.param(placeIds)}::uuid[]) AND p.status = 'verified'`)
    : [];
  const curated = places.length
    ? await db.execute<CarryRow>(sql`
        SELECT pc.place_id, ci.slug, pc.months
        FROM place_carry pc JOIN carry_item ci ON ci.id = pc.item_id
        WHERE pc.place_id = ANY(${sql.param(places.map((p) => p.id))}::uuid[])`)
    : [];

  const forItem = new Map<string, Set<string>>();
  const add = (slug: string, why: string | null) => {
    if (!(slug in CARRY_ITEMS)) return;
    const set = forItem.get(slug) ?? new Set<string>();
    if (why) set.add(why);
    forItem.set(slug, set);
  };
  for (const slug of RIDE_BASICS) add(slug, null);
  // The weather at the end of the road: a raincoat in its rains, a jacket in its cold.
  for (const c of estimateGuide({ category: "viewpoint", location: destination })?.carry ?? []) {
    if ((c.slug === "raincoat" || c.slug === "jacket") && needed(c.months, month)) {
      add(c.slug, null);
    }
  }
  for (const p of places) {
    const own = curated.filter((c) => c.place_id === p.id);
    const items = own.length
      ? own.map((c) => ({ slug: c.slug, months: c.months }))
      : (estimateGuide({
          category: p.category,
          location: [p.lng, p.lat],
          elevationM: parseElevation(p.ele ?? undefined),
        })?.carry ?? []);
    for (const c of items) if (needed(c.months, month)) add(c.slug, p.name);
  }

  return [...forItem].map(([slug, places]) => ({
    slug,
    name: CARRY_ITEMS[slug as CarrySlug].name,
    for: [...places].sort(),
  }));
}
