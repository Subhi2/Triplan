import { CARRY_ITEMS, type CarrySlug } from "./carryItems";
import { categoryStyle } from "./categories";
import type { LngLat } from "./geo";
import type { CarryEntry, GuideVehicle, PlaceGuide } from "./placeDetail";

// Estimated guidance for places nobody has written a guide for (almost every place imported from
// OpenStreetMap): months, vehicle and items to carry, worked out from the category, the climate
// of where the place is (from its coordinates, for any route) and its height. Shown as "Typical
// for waterfalls in the Western Ghats and the west coast", never as checked facts; a curated guide
// always wins. Calibrated against the curated places in docs/06-seed-data.md.

export type ClimateZone =
  | "west-coast"
  | "deccan"
  | "south-east"
  | "north-plains"
  | "thar"
  | "north-east"
  | "himalaya"
  | "high-himalaya";

interface Climate {
  label: string;
  rain: number[]; // monsoon months: roads wet, ghats foggy, leeches
  heat: number[];
  cold: number[]; // snow, closed passes or dense fog
  pleasant: number[];
}

const CLIMATE: Record<ClimateZone, Climate> = {
  "west-coast": {
    label: "the Western Ghats and the west coast",
    rain: [6, 7, 8, 9],
    heat: [4, 5],
    cold: [],
    pleasant: [10, 11, 12, 1, 2],
  },
  deccan: {
    label: "the Deccan",
    rain: [7, 8, 9],
    heat: [3, 4, 5],
    cold: [],
    pleasant: [10, 11, 12, 1, 2],
  },
  "south-east": {
    label: "the south-east coast",
    rain: [10, 11, 12],
    heat: [4, 5, 6],
    cold: [],
    pleasant: [1, 2, 3],
  },
  "north-plains": {
    label: "the northern plains",
    rain: [7, 8, 9],
    heat: [4, 5, 6],
    cold: [12, 1],
    pleasant: [10, 11, 2, 3],
  },
  thar: {
    label: "the Thar",
    rain: [7, 8],
    heat: [4, 5, 6],
    cold: [],
    pleasant: [10, 11, 12, 1, 2],
  },
  "north-east": {
    label: "the north-east",
    rain: [5, 6, 7, 8, 9],
    heat: [],
    cold: [],
    pleasant: [10, 11, 12, 1, 2, 3],
  },
  himalaya: {
    label: "the Himalayan hills",
    rain: [7, 8],
    heat: [],
    cold: [12, 1, 2],
    pleasant: [3, 4, 5, 6, 9, 10, 11],
  },
  "high-himalaya": {
    label: "the high Himalaya",
    rain: [],
    heat: [],
    cold: [11, 12, 1, 2, 3, 4],
    pleasant: [6, 7, 8, 9],
  },
};

/** The crest of the Western Ghats (latitude, longitude), north to south. */
const GHAT_CREST: [number, number][] = [
  [21.2, 73.6],
  [19, 73.7],
  [17, 73.95],
  [15, 74.4],
  [13, 75.7],
  [12, 75.9],
  [10, 76.9],
  [8, 77.4],
];

function crestLng(lat: number): number {
  for (let i = 0; i < GHAT_CREST.length - 1; i++) {
    const [lat1, lng1] = GHAT_CREST[i]!;
    const [lat2, lng2] = GHAT_CREST[i + 1]!;
    if (lat <= lat1 && lat >= lat2) return lng1 + ((lat - lat1) / (lat2 - lat1)) * (lng2 - lng1);
  }
  return GHAT_CREST.at(-1)![1];
}

/** Latitude where the western Himalaya rise from the plains, by longitude. */
function himalayaFootLat(lng: number): number {
  if (lng < 75.5) return 32.6;
  if (lng < 77.5) return 30.9;
  if (lng < 79) return 30.2;
  return 29.3;
}

/** The climate zone of a point; `elevationM` (when known) moves hill places up a zone. */
export function climateZone([lng, lat]: LngLat, elevationM: number | null = null): ClimateZone {
  const high = elevationM !== null && elevationM >= 3000;
  // Ladakh, Spiti and Lahaul: high, dry, snowbound in winter.
  if (lat >= 32 && lng <= 80)
    return elevationM !== null && elevationM < 2500 ? "himalaya" : "high-himalaya";
  if (lng <= 81.5 && lat >= himalayaFootLat(lng)) return high ? "high-himalaya" : "himalaya";
  // Sikkim, Darjeeling and the north-east states.
  if (lng >= 89.7 || (lng >= 88 && lat >= 26.9)) return high ? "high-himalaya" : "north-east";
  if (lat <= 14.6 && lng >= 78) return "south-east";
  if (lat <= 21.2 && lng <= crestLng(lat) + 0.25) return "west-coast";
  if ((lat >= 24 && lng <= 75.3) || (lat >= 22.5 && lng <= 71.5)) return "thar";
  if (lat >= 23.5) return "north-plains";
  return "deccan";
}

const ALL_MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const without = (months: number[], drop: number[]) => months.filter((m) => !drop.includes(m));
/** The `n` months after the last monsoon month, wrapping into January. */
function afterRain(rain: number[], n: number): number[] {
  if (rain.length === 0) return [];
  const last = rain.at(-1)!;
  return Array.from({ length: n }, (_, i) => ((last + i) % 12) + 1);
}

const OUTDOOR_CLIMB = new Set(["trek", "peak", "pass", "cave"]);
const WET_IN_RAIN = new Set(["trek", "peak", "viewpoint", "cave", "waterfall", "wildlife"]);

interface Months {
  best: number[];
  ok: number[];
  avoid: number[];
}

function monthsFor(category: string, zone: ClimateZone): Months {
  const c = CLIMATE[zone];
  let avoid: number[];
  let best: number[];
  if (zone === "high-himalaya") {
    // Roads and passes open from late May or June to September.
    avoid = c.cold;
    best = c.pleasant;
  } else if (category === "waterfall") {
    // Fullest at the end of the monsoon and just after it; thin or dry in the hot months.
    best = [...c.rain.slice(-2), ...afterRain(c.rain, 2)];
    avoid = c.heat.length > 0 ? c.heat : [];
  } else if (category === "lake") {
    best = [...c.rain.slice(-2), ...c.pleasant];
    avoid = zone === "thar" ? c.heat : [];
  } else if (category === "beach") {
    best = c.pleasant;
    avoid = c.rain;
  } else if (category === "wildlife") {
    // Most parks close or flood in the monsoon.
    best = c.pleasant;
    avoid = c.rain;
  } else if (OUTDOOR_CLIMB.has(category)) {
    best = c.pleasant;
    avoid = zone === "west-coast" || zone === "north-east" || zone === "himalaya" ? c.rain : [];
    if (zone === "himalaya" && category !== "cave") avoid = [...avoid, ...c.cold];
  } else if (category === "viewpoint") {
    best = c.pleasant;
    // The wettest months bring cloud that hides the view.
    avoid = zone === "west-coast" || zone === "north-east" ? c.rain.slice(1, 3) : [];
  } else {
    best = c.pleasant;
    // Open forts and ruins in the heat of the plains and the coast.
    avoid =
      (category === "fort" || category === "heritage") &&
      (zone === "thar" || zone === "north-plains" || zone === "south-east")
        ? c.heat
        : [];
  }
  best = without([...new Set(best)], avoid);
  return { best, avoid, ok: without(ALL_MONTHS, [...best, ...avoid]) };
}

function vehiclesFor(category: string, zone: ClimateZone): GuideVehicle[] {
  if (zone === "high-himalaya") return ["bike", "suv_4x4"];
  if (category === "trek" || category === "peak") return ["bike", "on_foot"];
  if (category === "pass") return ["bike", "car", "suv_4x4"];
  return ["bike", "car"];
}

/** Items in order of relevance, with the months they are needed ([] = all year). */
function carryFor(category: string, zone: ClimateZone): [CarrySlug, number[]][] {
  const c = CLIMATE[zone];
  const wet: [CarrySlug, number[]][] = c.rain.length > 0 ? [["raincoat", c.rain]] : [];
  const leeches =
    (zone === "west-coast" || zone === "north-east") && WET_IN_RAIN.has(category)
      ? ([["leech_socks", [...c.rain, ...afterRain(c.rain, 1)]]] as [CarrySlug, number[]][])
      : [];
  const warm: [CarrySlug, number[]][] =
    zone === "high-himalaya"
      ? [
          ["jacket", []],
          ["gloves", []],
        ]
      : c.cold.length > 0
        ? [["jacket", c.cold]]
        : [];
  const sun: [CarrySlug, number[]][] = c.heat.length > 0 ? [["cap", c.heat]] : [];
  const items: [CarrySlug, number[]][] = (() => {
    switch (category) {
      case "waterfall":
        return [["grip_shoes", []], ...leeches, ["spare_clothes", []], ["dry_bag", []], ...wet];
      case "trek":
      case "peak":
        return [
          ["trekking_shoes", []],
          ["water_2l", []],
          ...leeches,
          ...warm,
          ["snacks", []],
          ["first_aid", []],
          ...wet,
        ];
      case "pass":
        return [...warm, ["water_2l", []], ["snacks", []], ["cash", []], ["power_bank", []]];
      case "cave":
        return [["torch", []], ["grip_shoes", []], ...leeches, ...wet];
      case "temple":
      case "worship":
        return [
          ["modest_clothing", []],
          ...(c.heat.length > 0 ? ([["socks_hot_rock", c.heat]] as [CarrySlug, number[]][]) : []),
          ...warm,
          ...wet,
        ];
      case "fort":
      case "heritage":
        return [["water_2l", []], ...sun, ["trekking_shoes", []], ...warm, ...wet];
      case "beach":
        return [...sun, ["spare_clothes", []], ["dry_bag", c.rain], ["water_2l", []]];
      case "wildlife":
        return [["forest_permit", []], ...leeches, ["water_2l", []], ...warm, ...wet];
      case "viewpoint":
      case "lake":
        return [...leeches, ...warm, ...wet, ...sun];
      default:
        return [...warm, ...wet, ...sun];
    }
  })();
  const seen = new Set<CarrySlug>();
  return items.filter(([slug]) => !seen.has(slug) && seen.add(slug)).slice(0, 6);
}

const PLURAL: Record<string, string> = {
  worship: "places of worship",
  heritage: "heritage sites",
  wildlife: "wildlife parks",
  food: "food stops",
  coffee: "coffee stops",
  beach: "beaches",
  pass: "mountain passes",
  stay: "places to stay",
};

/** "Typical for waterfalls in the Western Ghats and the west coast". */
export function estimateBasis(category: string, zone: ClimateZone): string {
  const plural = PLURAL[category] ?? `${categoryStyle(category).name.toLowerCase()}s`;
  return `Typical for ${plural} in ${CLIMATE[zone].label}`;
}

export interface GuideEstimate {
  guide: PlaceGuide;
  carry: CarryEntry[];
  basis: string;
}

/** No estimate for towns and fuel stations: they have no guide. */
const NO_GUIDE = new Set(["town", "fuel"]);

/** Estimated guide and items to carry for a place with none, or null for towns and fuel. */
export function estimateGuide({
  category,
  location,
  elevationM = null,
}: {
  category: string;
  location: LngLat;
  elevationM?: number | null;
}): GuideEstimate | null {
  if (NO_GUIDE.has(category)) return null;
  const zone = climateZone(location, elevationM);
  const months = monthsFor(category, zone);
  return {
    guide: {
      bestVehicles: vehiclesFor(category, zone),
      lastMileNote: null,
      roadCondition: null,
      bestMonths: months.best,
      okMonths: months.ok,
      avoidMonths: months.avoid,
      bestTimeOfDay: null,
      visitDurationMin: null,
      timings: null,
      entryFee: null,
      dressCode: null,
      permitNeeded: null,
      notes: null,
    },
    carry: carryFor(category, zone).map(([slug, monthsNeeded]) => ({
      slug,
      name: CARRY_ITEMS[slug].name,
      months: monthsNeeded,
      reason: null,
    })),
    basis: estimateBasis(category, zone),
  };
}

/** Best months for a list row with no curated months (the In season badge). */
export function estimateBestMonths(category: string, location: LngLat): number[] {
  if (NO_GUIDE.has(category)) return [];
  return monthsFor(category, climateZone(location)).best;
}

/** OSM's ele tag ("1930", "1930 m") in metres, or null. */
export function parseElevation(ele: string | undefined): number | null {
  const m = ele ? /^\s*(-?\d+(?:\.\d+)?)\s*(m)?\s*$/i.exec(ele) : null;
  return m ? Math.round(Number(m[1])) : null;
}
