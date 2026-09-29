/**
 * Place categories: the single list used by the UI (name, colour), the seed script and the
 * OpenStreetMap import (name, icon, ranking weight). Slugs match the category table.
 * Icons are lucide icon names.
 */
export const CATEGORIES = {
  temple: { name: "Temple", color: "#c2410c", icon: "landmark", weight: 1 },
  worship: { name: "Place of worship", color: "#9a3412", icon: "church", weight: 0.9 },
  heritage: { name: "Heritage", color: "#a16207", icon: "castle", weight: 1.2 },
  fort: { name: "Fort", color: "#7c2d12", icon: "castle", weight: 1 },
  museum: { name: "Museum", color: "#4f46e5", icon: "library", weight: 1 },
  attraction: { name: "Attraction", color: "#e11d48", icon: "star", weight: 1 },
  viewpoint: { name: "Viewpoint", color: "#7c3aed", icon: "binoculars", weight: 1.1 },
  waterfall: { name: "Waterfall", color: "#0284c7", icon: "droplets", weight: 1.1 },
  trek: { name: "Trek", color: "#15803d", icon: "footprints", weight: 1 },
  peak: { name: "Peak", color: "#4d7c0f", icon: "mountain", weight: 0.9 },
  cave: { name: "Cave", color: "#57534e", icon: "circle-dashed", weight: 1 },
  lake: { name: "Lake", color: "#0e7490", icon: "waves", weight: 0.9 }, // many are village tanks
  beach: { name: "Beach", color: "#ca8a04", icon: "umbrella", weight: 1 },
  food: { name: "Food", color: "#dc2626", icon: "utensils", weight: 0.8 },
  coffee: { name: "Coffee", color: "#78350f", icon: "coffee", weight: 0.8 },
  fuel: { name: "Fuel", color: "#475569", icon: "fuel", weight: 0.5 },
  stay: { name: "Stay", color: "#db2777", icon: "bed", weight: 0.7 },
  town: { name: "Town", color: "#334155", icon: "building-2", weight: 0 },
} as const satisfies Record<string, { name: string; color: string; icon: string; weight: number }>;

export type CategorySlug = keyof typeof CATEGORIES;

/**
 * Categories shown in the "places along this route" list and on the map. Towns only label routes.
 * Fuel stations are imported (for the planned fuel-range planner) but kept out of the list.
 */
export const PLACE_LIST_CATEGORIES = (Object.keys(CATEGORIES) as CategorySlug[]).filter(
  (slug) => slug !== "fuel" && slug !== "town",
);

export function isCategorySlug(slug: string): slug is CategorySlug {
  return Object.hasOwn(CATEGORIES, slug);
}

export function categoryStyle(slug: string): { name: string; color: string } {
  if (isCategorySlug(slug)) return CATEGORIES[slug];
  return {
    name: slug.charAt(0).toUpperCase() + slug.slice(1).replace(/_/g, " "),
    color: "#64748b",
  };
}
