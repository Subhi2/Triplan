import { serverEnv } from "../../env";
import { createOsmApiProvider, type OsmCurrentProvider } from "./osmApi";
import { createOverpassProvider } from "./overpass";
import { fetchRegionOutline, type RegionOutline } from "./regionOutline";
import type { OsmPlacesProvider } from "./types";

export * from "./types";
export type { RegionOutline } from "./regionOutline";
export type { OsmCurrent, OsmCurrentProvider } from "./osmApi";

/** The OSM API, read only: is a place the import did not see really gone? */
export function getOsmCurrentProvider(): OsmCurrentProvider {
  return createOsmApiProvider(serverEnv().NOMINATIM_USER_AGENT);
}

/** Overpass API for the OpenStreetMap places import. */
export function getOsmPlacesProvider(): OsmPlacesProvider {
  const env = serverEnv();
  return createOverpassProvider(env.OVERPASS_URLS, env.NOMINATIM_USER_AGENT);
}

/** A state's outline from Nominatim, or null (then every tile is fetched). */
export function getRegionOutline(stateName: string): Promise<RegionOutline | null> {
  const env = serverEnv();
  return fetchRegionOutline(env.NOMINATIM_BASE_URL, env.NOMINATIM_USER_AGENT, stateName);
}
