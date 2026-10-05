import { terrainTilesUrl } from "@/lib/terrain";
import { serverEnv } from "../../env";
import { createTerrariumProvider } from "./terrarium";
import type { ElevationProvider } from "./types";

export * from "./types";

let provider: ElevationProvider | undefined;

/**
 * Heights from Terrarium tiles (NEXT_PUBLIC_TERRAIN_TILES_URL, AWS Terrain Tiles by default).
 * One instance per server process, so its decoded tiles are shared between requests.
 */
export function getElevationProvider(): ElevationProvider {
  provider ??= createTerrariumProvider(terrainTilesUrl(), serverEnv().NOMINATIM_USER_AGENT);
  return provider;
}
