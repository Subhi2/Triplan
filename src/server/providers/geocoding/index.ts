import { geocodeDbCache } from "../../db/cache";
import { serverEnv } from "../../env";
import { withGeocodeCache } from "./cached";
import { createNominatimProvider } from "./nominatim";
import type { GeocodingProvider } from "./types";

export * from "./types";

let provider: GeocodingProvider | undefined;

/** Nominatim behind the geocode_cache table. */
export function getGeocodingProvider(): GeocodingProvider {
  if (!provider) {
    const env = serverEnv();
    provider = withGeocodeCache(
      createNominatimProvider(env.NOMINATIM_BASE_URL, env.NOMINATIM_USER_AGENT),
      geocodeDbCache,
    );
  }
  return provider;
}
