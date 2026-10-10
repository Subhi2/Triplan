/**
 * What riders do that is worth counting (docs/07, "What to measure"). Counted per day in
 * usage_daily as "event:<name>" through POST /api/usage, and sent to Vercel Web Analytics as custom
 * events. Nothing about who did it is kept.
 */
export const USAGE_EVENTS = [
  "trip_saved",
  "share",
  "gpx",
  "google_maps",
  "preview_3d",
  "video_saved",
  "ride_there",
  "plain_words",
  "near_me",
] as const;

export type UsageEvent = (typeof USAGE_EVENTS)[number];

export function isUsageEvent(name: unknown): name is UsageEvent {
  return typeof name === "string" && (USAGE_EVENTS as readonly string[]).includes(name);
}
