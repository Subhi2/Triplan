import { RIDE_AREAS, rideArea, type RideArea, type RideTier } from "./rides";

// A rider's bucket-list badges (docs/01-product-spec.md): worked out from their done rides each
// time, never stored, so changing a mark or adding rides updates them on its own.

export interface BadgeRide {
  slug: string;
  region: string;
  tier: RideTier;
}

export interface Badge {
  id: string;
  title: string;
  description: string;
  have: number;
  need: number;
  earned: boolean;
}

/** How many done rides in one part of India earn its explorer badge. */
export const AREA_BADGE_RIDES = 3;
/** The count badges, in order. */
export const COUNT_BADGES = [
  { need: 1, title: "First ride", description: "Mark your first famous ride as done." },
  { need: 5, title: "Five rides", description: "Ride five of India's famous rides." },
  { need: 10, title: "Ten rides", description: "Ride ten of India's famous rides." },
  {
    need: 25,
    title: "Twenty-five rides",
    description: "Ride twenty-five of India's famous rides.",
  },
] as const;
export const LEGEND_BADGES = [1, 3] as const;

const badge = (
  id: string,
  title: string,
  description: string,
  have: number,
  need: number,
): Badge => ({
  id,
  title,
  description,
  have: Math.min(have, need),
  need,
  earned: have >= need,
});

/**
 * The badges for the rides a rider has done. `doneSlugs` may hold slugs of rides we no longer
 * have; they are ignored. Count and Legend badges come first, then one per part of India that has
 * enough rides, then "every Legend".
 */
export function badgesFor(rides: BadgeRide[], doneSlugs: Iterable<string>): Badge[] {
  const done = new Set(doneSlugs);
  const mine = rides.filter((r) => done.has(r.slug));
  const out: Badge[] = COUNT_BADGES.map((b) =>
    badge(`rides-${b.need}`, b.title, b.description, mine.length, b.need),
  );

  const legends = rides.filter((r) => r.tier === "legend");
  const legendsDone = mine.filter((r) => r.tier === "legend").length;
  for (const need of LEGEND_BADGES) {
    if (legends.length < need) continue;
    out.push(
      badge(
        `legend-${need}`,
        need === 1 ? "Legend" : `${need} Legends`,
        `Ride ${need === 1 ? "one" : need} of the once-in-a-lifetime Legend rides.`,
        legendsDone,
        need,
      ),
    );
  }

  for (const area of RIDE_AREAS) {
    const inArea = rides.filter((r) => rideArea(r.region) === area);
    if (inArea.length < AREA_BADGE_RIDES) continue;
    const have = mine.filter((r) => rideArea(r.region) === area).length;
    out.push(areaBadge(area, have));
  }

  if (legends.length > Math.max(...LEGEND_BADGES)) {
    out.push(
      badge("legend-all", "Every Legend", "Ride every Legend ride.", legendsDone, legends.length),
    );
  }
  return out;
}

function areaBadge(area: RideArea, have: number): Badge {
  return badge(
    `area-${area.toLowerCase().replace(/[^a-z]+/g, "-")}`,
    `${area} explorer`,
    `Ride ${AREA_BADGE_RIDES} famous rides in ${area}.`,
    have,
    AREA_BADGE_RIDES,
  );
}
