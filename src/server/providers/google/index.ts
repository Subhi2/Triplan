import { serverEnv } from "../../env";
import { createGooglePlacesProvider } from "./places";
import type { GooglePlacesProvider } from "./types";

export * from "./types";
export { isPhotoName } from "./places";

/** The Places API (New) provider, or null when GOOGLE_MAPS_API_KEY is not set. */
export function getGooglePlacesProvider(): GooglePlacesProvider | null {
  const key = serverEnv().GOOGLE_MAPS_API_KEY;
  return key ? createGooglePlacesProvider(key) : null;
}
