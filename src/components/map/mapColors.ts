/**
 * Colours drawn by map code, which takes literal values (MapLibre paint, Google's APIs, inline
 * SVG) instead of Tailwind classes. One set for both maps, so they look alike. `brand` matches
 * `--color-brand` in globals.css.
 */
export const MAP_COLORS = {
  /** The selected route, cluster rings, the "you are here" cone. */
  brand: "#0f766e",
  /** Cluster counts. */
  brandText: "#115e59",
  /** A ride the rider wants to do (bucket list map): marigold. */
  pending: "#d97706",
  /** Route options not picked: dashed, warm grey from the paper palette. */
  altRoute: "#8c877c",
  /** The casing under the route and around pins. */
  casing: "#ffffff",
  /** The ring of the active place. */
  active: "#111827",
} as const;

/** The same roles with string values, so a palette can be swapped for another. */
export type MapPalette = { [K in keyof typeof MAP_COLORS]: string };

/**
 * The Google map's dark scheme: its land is dark teal-green, where the light-mode teal line all
 * but disappears. Lines go bright mint with a dark edge (`edge`), the amber and grey lighten.
 */
export const MAP_COLORS_DARK: MapPalette & { edge: string } = {
  brand: "#5eead4",
  brandText: "#115e59",
  pending: "#fbbf24",
  altRoute: "#d6d3cb",
  casing: "#ffffff",
  active: "#ffffff",
  /** A thin dark line under a line that has no white casing, so it stands off the land. */
  edge: "#04201c",
};
