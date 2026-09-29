import { serverEnv } from "../../env";
import { createGooglePlacesProvider } from "./places";
import type { GooglePlacesProvider } from "./types";

export * from "./types";
export { isPhotoName } from "./places";

/**
 * The Places API (New) provider, or null without a key. Uses GOOGLE_MAPS_API_KEY when a separate
 * server key is set, else the one Google key in NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.
 */
export function getGooglePlacesProvider(): GooglePlacesProvider | null {
  const env = serverEnv();
  const key = env.GOOGLE_MAPS_API_KEY ?? env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  return key ? createGooglePlacesProvider(key) : null;
}
