import { z } from "zod";
import { round5 } from "@/lib/geo";
import { createThrottle, fetchJson, ProviderError } from "../http";
import type { GeocodeHit, GeocodeOptions, GeocodingProvider } from "./types";

/** Results are limited to India (the bbox) and must be tagged countrycode IN. */
const INDIA_BBOX = [68.1, 6.5, 97.5, 35.7];
const OSM_TYPES: Record<string, string> = { N: "node", W: "way", R: "relation" };

const photonFeatureSchema = z.object({
  geometry: z.object({
    type: z.literal("Point"),
    coordinates: z.tuple([z.number(), z.number()]),
  }),
  properties: z.object({
    osm_type: z.string().optional(),
    osm_id: z.number().optional(),
    osm_key: z.string().optional(),
    osm_value: z.string().optional(),
    name: z.string().optional(),
    city: z.string().optional(),
    district: z.string().optional(),
    county: z.string().optional(),
    state: z.string().optional(),
    countrycode: z.string().optional(),
  }),
});

export const photonResponseSchema = z.object({ features: z.array(photonFeatureSchema) });

export function buildPhotonSearchUrl(
  baseUrl: string,
  query: string,
  { limit = 8, near, zoom }: GeocodeOptions = {},
): string {
  const params = new URLSearchParams({
    q: query,
    limit: String(limit),
    lang: "en",
    bbox: INDIA_BBOX.join(","),
  });
  // Rivers and streams share names with villages ("Samse Halla") and are never a trip stop.
  params.append("osm_tag", "!waterway");
  if (near) {
    // Prefer places near the map centre; the map zoom sets how local that preference is.
    params.set("lat", String(round5(near[1])));
    params.set("lon", String(round5(near[0])));
    params.set("zoom", String(Math.round(Math.min(18, Math.max(1, zoom ?? 8)))));
  }
  return `${baseUrl.replace(/\/$/, "")}?${params}`;
}

/** "Samse, Kalasa taluk, Karnataka": name plus the places it is in, without repeats. */
function label(p: z.infer<typeof photonFeatureSchema>["properties"], name: string): string {
  const parts = [name, p.city, p.district, p.county, p.state].filter(
    (part): part is string => !!part,
  );
  return [...new Set(parts)].join(", ");
}

export function parsePhotonResponse(body: z.infer<typeof photonResponseSchema>): GeocodeHit[] {
  return body.features.flatMap((f): GeocodeHit[] => {
    const p = f.properties;
    const name = p.name?.trim();
    if (!name || p.countrycode !== "IN") return [];
    const type = OSM_TYPES[p.osm_type ?? ""];
    return [
      {
        id: type && p.osm_id ? `${type}/${p.osm_id}` : `photon/${f.geometry.coordinates.join(",")}`,
        name,
        label: label(p, name),
        location: f.geometry.coordinates,
        kind: `${p.osm_key ?? "unknown"}/${p.osm_value ?? "unknown"}`,
      },
    ];
  });
}

// Photon's public instance asks for fair use; suggestions are debounced and cached, and this
// spaces out whatever still reaches it.
const throttle = createThrottle(200);

/** Photon (komoot): search-as-you-type geocoding over OpenStreetMap, tolerant of typos. */
export function createPhotonProvider(baseUrl: string, userAgent: string): GeocodingProvider {
  return {
    async search(query, options = {}) {
      await throttle();
      const { status, data } = await fetchJson(
        "photon",
        buildPhotonSearchUrl(baseUrl, query, options),
        photonResponseSchema,
        { headers: { "User-Agent": userAgent } },
        5_000,
      );
      if (status !== 200) throw new ProviderError(`Photon HTTP ${status}`, "photon", status);
      return parsePhotonResponse(data);
    },
  };
}
