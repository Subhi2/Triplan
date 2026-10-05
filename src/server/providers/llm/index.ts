import { createAnthropicTripProvider, DEFAULT_TRIP_MODEL } from "./anthropic";
import type { TripIntentProvider } from "./types";

export * from "./types";

// Planning in plain words (docs/02, "Plan in plain words"). Place-name extraction for the
// hidden-places pipeline (phase 6) will live here too.

/** Whether the AI key is set: without it the feature is hidden and no call is made. */
export function aiEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

let provider: TripIntentProvider | undefined;

/** Claude for reading trip requests (ANTHROPIC_TRIP_MODEL, Claude Haiku by default), or null. */
export function getTripIntentProvider(): TripIntentProvider | null {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) return null;
  provider ??= createAnthropicTripProvider(
    key,
    process.env.ANTHROPIC_TRIP_MODEL?.trim() || DEFAULT_TRIP_MODEL,
  );
  return provider;
}
