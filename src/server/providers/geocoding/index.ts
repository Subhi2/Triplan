import { geocodeDbCache } from "../../db/cache";
import { serverEnv } from "../../env";
import { withGeocodeCache } from "./cached";
import { createNominatimProvider } from "./nominatim";
import { createPhotonProvider } from "./photon";
import type { GeocodingProvider } from "./types";

export * from "./types";

let nominatim: GeocodingProvider | undefined;
let photon: GeocodingProvider | undefined;

/**
 * Nominatim behind the geocode_cache table. Used when the rider presses Enter (and by scripts):
 * its public server allows 1 request/second and forbids search-as-you-type.
 */
export function getGeocodingProvider(): GeocodingProvider {
  if (!nominatim) {
    const env = serverEnv();
    nominatim = withGeocodeCache(
      createNominatimProvider(env.NOMINATIM_BASE_URL, env.NOMINATIM_USER_AGENT),
      geocodeDbCache,
      "nominatim",
    );
  }
  return nominatim;
}

/** Photon behind the geocode_cache table, for suggestions while the rider types. */
export function getSuggestionProvider(): GeocodingProvider {
  if (!photon) {
    const env = serverEnv();
    photon = withGeocodeCache(
      createPhotonProvider(env.PHOTON_BASE_URL, env.NOMINATIM_USER_AGENT),
      geocodeDbCache,
      "photon",
    );
  }
  return photon;
}
