// The server's best guess at the screen (docs/08-design.md, "Layout"), so the planner and Near me
// render the right layout from the start instead of the phone one and then jumping. Their layout
// is picked in code (useMediaQuery), and the server cannot measure the screen; it reads the
// browser's last answer from a cookie, or on a first visit guesses from the device type.

/** The media queries the layout code asks, by short name. */
export const VIEWPORT_QUERIES = {
  md: "(min-width: 768px)",
  lg: "(min-width: 1024px)",
  coarse: "(pointer: coarse)",
} as const;

export type ViewportKey = keyof typeof VIEWPORT_QUERIES;
export type ViewportHint = Record<ViewportKey, boolean>;

/** The browser writes what its screen answers here, for the server's next render. */
export const VIEWPORT_COOKIE = "vp";

const KEYS = Object.keys(VIEWPORT_QUERIES) as ViewportKey[];

/** The short name of a query the layout asks, if it is one of them. */
export function viewportKey(query: string): ViewportKey | undefined {
  return KEYS.find((k) => VIEWPORT_QUERIES[k] === query);
}

/** "md.lg" for a laptop, "coarse" for a phone, "none" when nothing matches. */
export function serializeViewportHint(hint: ViewportHint): string {
  const on = KEYS.filter((k) => hint[k]);
  return on.length > 0 ? on.join(".") : "none";
}

/** The cookie's value, or null when it is missing or not ours. */
export function parseViewportHint(value: string | undefined): ViewportHint | null {
  if (!value) return null;
  const parts = value === "none" ? [] : value.split(".");
  if (!parts.every((p) => (KEYS as string[]).includes(p))) return null;
  return { md: parts.includes("md"), lg: parts.includes("lg"), coarse: parts.includes("coarse") };
}

/**
 * A first visit's guess from the device type (Next's user-agent parser): a phone is narrow with
 * touch, a tablet is wide enough for the side panel with touch, anything else is a laptop.
 */
export function guessViewport(deviceType: string | undefined): ViewportHint {
  if (deviceType === "mobile" || deviceType === "wearable")
    return { md: false, lg: false, coarse: true };
  if (deviceType === "tablet") return { md: true, lg: false, coarse: true };
  return { md: true, lg: true, coarse: false };
}
