import { serverEnv } from "../../env";
import { createOverpassProvider } from "./overpass";
import type { OsmPlacesProvider } from "./types";

export * from "./types";

/** Overpass API for the OpenStreetMap places import. */
export function getOsmPlacesProvider(): OsmPlacesProvider {
  const env = serverEnv();
  return createOverpassProvider(env.OVERPASS_URLS, env.NOMINATIM_USER_AGENT);
}
