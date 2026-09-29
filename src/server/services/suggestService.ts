import { haversineM, type LngLat } from "@/lib/geo";
import type { GeocodeResult } from "@/lib/trip";
import { getSuggestionProvider, type GeocodeHit } from "../providers/geocoding";
import { searchPlacesByName, type LocalPlaceMatch } from "./placeService";

export const MAX_LOCAL_SUGGESTIONS = 4;
export const MAX_SUGGESTIONS = 8;
const SAME_PLACE_M = 3_000;

export interface SuggestDeps {
  local(query: string, limit: number): Promise<LocalPlaceMatch[]>;
  photon: {
    search(
      query: string,
      options: { limit: number; near?: LngLat; zoom?: number },
    ): Promise<GeocodeHit[]>;
  };
}

function defaultDeps(): SuggestDeps {
  return { local: searchPlacesByName, photon: getSuggestionProvider() };
}

const normalise = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Suggestions while the rider types: our own places first (curated and imported, with their guide
 * data), then Photon results for everything else, minus Photon's copies of places we already list
 * (same OSM id, or the same name within 3 km). If Photon is down, our places still come back.
 */
export async function suggestPlaces(
  query: string,
  bias: { near?: LngLat; zoom?: number } = {},
  deps: SuggestDeps = defaultDeps(),
): Promise<GeocodeResult[]> {
  const [local, remote] = await Promise.all([
    deps.local(query, MAX_LOCAL_SUGGESTIONS),
    deps.photon.search(query, { limit: MAX_SUGGESTIONS, ...bias }).catch((err: unknown) => {
      console.error("Photon suggestions failed", err);
      return [];
    }),
  ]);

  const others = remote.filter(
    (hit) =>
      !local.some(
        (l) =>
          l.osmId === hit.id ||
          (normalise(l.name) === normalise(hit.name) &&
            haversineM(l.location, hit.location) <= SAME_PLACE_M),
      ),
  );

  return [
    ...local.map(({ id, name, label, location, source }): GeocodeResult => ({
      id,
      name,
      label,
      location,
      source,
    })),
    ...others.slice(0, MAX_SUGGESTIONS - local.length).map((hit): GeocodeResult => ({
      id: hit.id,
      name: hit.name,
      label: hit.label,
      location: hit.location,
      source: "photon",
    })),
  ];
}
