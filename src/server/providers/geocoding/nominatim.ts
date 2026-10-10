import { z } from "zod";
import { createThrottle, fetchJson, ProviderError } from "../http";
import type { GeocodeHit, GeocodeOptions, GeocodingProvider } from "./types";

const nominatimResultSchema = z.object({
  place_id: z.number(),
  osm_type: z.string().optional(),
  osm_id: z.number().optional(),
  lat: z.coerce.number(),
  lon: z.coerce.number(),
  display_name: z.string(),
  name: z.string().optional(),
  category: z.string().optional(),
  type: z.string().optional(),
});

export const nominatimResponseSchema = z.array(nominatimResultSchema);

export function buildNominatimSearchUrl(
  baseUrl: string,
  query: string,
  { limit = 5, viewbox }: GeocodeOptions = {},
): string {
  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    countrycodes: "in", // India bias
    limit: String(limit),
    "accept-language": "en",
  });
  if (viewbox) {
    params.set("viewbox", viewbox.join(","));
    params.set("bounded", "1");
  }
  return `${baseUrl.replace(/\/$/, "")}/search?${params}`;
}

export function parseNominatimResponse(
  body: z.infer<typeof nominatimResponseSchema>,
): GeocodeHit[] {
  return body.map((r) => ({
    id: r.osm_type && r.osm_id ? `${r.osm_type}/${r.osm_id}` : `place/${r.place_id}`,
    name: r.name || r.display_name.split(",")[0]!.trim(),
    label: r.display_name,
    location: [r.lon, r.lat],
    kind: `${r.category ?? "unknown"}/${r.type ?? "unknown"}`,
  }));
}

// Public Nominatim: max 1 request/second per the usage policy. Slightly over to be safe.
// More than 10 s of queue fails fast instead of holding the request open.
const throttle = createThrottle(1_100, Date.now, 10_000);

export function createNominatimProvider(baseUrl: string, userAgent: string): GeocodingProvider {
  return {
    async search(query: string, options: GeocodeOptions = {}) {
      await throttle();
      const { status, data } = await fetchJson(
        "nominatim",
        buildNominatimSearchUrl(baseUrl, query, options),
        nominatimResponseSchema,
        { headers: { "User-Agent": userAgent } },
      );
      if (status !== 200) throw new ProviderError(`Nominatim HTTP ${status}`, "nominatim", status);
      return parseNominatimResponse(data);
    },
  };
}
