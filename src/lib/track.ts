import { track } from "@vercel/analytics";
import type { UsageEvent } from "./usageEvents";

/**
 * Counts one use of a feature: a custom event in Vercel Web Analytics (recorded on paid plans) and
 * our own daily count (POST /api/usage, sent as a beacon so it survives leaving the page). Never
 * throws and never waits.
 */
export function trackEvent(name: UsageEvent): void {
  try {
    track(name);
  } catch {
    // Analytics not loaded (local runs, blockers): fine.
  }
  try {
    const body = new Blob([JSON.stringify({ event: name })], { type: "application/json" });
    if (!navigator.sendBeacon?.("/api/usage", body)) {
      void fetch("/api/usage", { method: "POST", body, keepalive: true }).catch(() => {});
    }
  } catch {
    // No beacon and no fetch: nothing to do.
  }
}
