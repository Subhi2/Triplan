import type { LngLat } from "./geo";

/** Slugs are lowercase words joined by hyphens ("manjarabad-fort", "mysore-palace-w656323590"). */
export const PLACE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const GUIDE_VEHICLES = ["bike", "car", "suv_4x4", "on_foot", "bus"] as const;
export type GuideVehicle = (typeof GUIDE_VEHICLES)[number];

export const VEHICLE_LABELS: Record<GuideVehicle, string> = {
  bike: "Bike",
  car: "Car",
  suv_4x4: "SUV / 4x4",
  on_foot: "On foot",
  bus: "Bus",
};

/** Curated guide fields (place_guide). Months are 1–12. */
export interface PlaceGuide {
  bestVehicles: GuideVehicle[]; // best first
  lastMileNote: string | null;
  roadCondition: string | null; // good | fair | rough
  bestMonths: number[];
  okMonths: number[];
  avoidMonths: number[];
  bestTimeOfDay: string | null;
  visitDurationMin: number | null;
  timings: string | null;
  entryFee: string | null;
  dressCode: string | null;
  permitNeeded: string | null;
  notes: string | null;
}

export interface CarryEntry {
  slug: string;
  name: string;
  months: number[]; // empty = all year
  reason: string | null;
}

/** An image with the attribution every displayed image must carry. */
export interface PlaceMedia {
  url: string;
  thumbUrl: string | null;
  author: string | null;
  authorUrl: string | null;
  license: string;
  source: string;
}

export interface PlaceVideo {
  url: string;
  source: "youtube" | "instagram";
  creator: string | null;
  title: string | null;
}

export interface PlaceReview {
  id: string;
  rating: number;
  body: string | null;
  visitedMonth: number | null;
  visitedYear: number | null;
  vehicleUsed: GuideVehicle | null;
  author: string | null;
  createdAt: string; // ISO
}

/** GET /api/places/[slug]. Route-specific fields (km, detour) come from the places list. */
export interface PlaceDetail {
  id: string;
  slug: string;
  name: string;
  category: string;
  location: LngLat;
  district: string | null;
  state: string | null;
  description: string | null;
  rating: number | null; // our reviews
  ratingCount: number;
  trending: boolean;
  guide: PlaceGuide | null;
  carry: CarryEntry[];
  media: PlaceMedia[];
  externalRatings: { source: string; rating: number; count: number | null }[];
  videos: PlaceVideo[];
  reviews: PlaceReview[];
  /** Facts from the place's OpenStreetMap tags, shown where the guide has nothing. */
  osm: {
    id: string | null; // "node/123"
    openingHours: string | null;
    fee: string | null;
    website: string | null;
    wikipediaUrl: string | null;
  };
}

/** Items to carry with the ones needed in `month` first (all-year items count as needed). */
export function carryBySeason(
  carry: CarryEntry[],
  month: number,
): (CarryEntry & { inSeason: boolean })[] {
  const tagged = carry.map((c) => ({
    ...c,
    inSeason: c.months.length === 0 || c.months.includes(month),
  }));
  return [...tagged.filter((c) => c.inSeason), ...tagged.filter((c) => !c.inSeason)];
}

export type MonthRating = "best" | "ok" | "avoid" | null;

/** Best / ok / avoid for each month Jan..Dec (index 0 = January). Avoid wins over best. */
export function monthRatings(
  guide: Pick<PlaceGuide, "bestMonths" | "okMonths" | "avoidMonths"> | null,
): MonthRating[] {
  return Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    if (!guide) return null;
    if (guide.avoidMonths.includes(m)) return "avoid";
    if (guide.bestMonths.includes(m)) return "best";
    if (guide.okMonths.includes(m)) return "ok";
    return null;
  });
}
