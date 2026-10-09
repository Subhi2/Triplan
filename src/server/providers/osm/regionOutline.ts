import { z } from "zod";
import type { LngLat } from "@/lib/geo";
import { createThrottle, fetchJson, ProviderError } from "../http";

// A state's outline from Nominatim, so the places import can skip tiles that do not touch the
// state (Chhattisgarh's box is 117 half-degree tiles, about half of them outside it). One request
// per state per run, at most 1 per second (Nominatim's usage policy). Simplified to about 500 m.

const ringSchema = z.array(z.tuple([z.number(), z.number()]).rest(z.number()));
const geojsonSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("Polygon"), coordinates: z.array(ringSchema) }),
  z.object({ type: z.literal("MultiPolygon"), coordinates: z.array(z.array(ringSchema)) }),
  z.object({ type: z.literal("Point"), coordinates: z.array(z.number()) }),
  z.object({ type: z.literal("LineString"), coordinates: z.array(z.array(z.number())) }),
]);
const resultSchema = z.object({
  osm_type: z.string().optional(),
  category: z.string().optional(),
  type: z.string().optional(),
  addresstype: z.string().optional(),
  name: z.string().optional(),
  geojson: geojsonSchema.optional(),
});
export const regionOutlineResponseSchema = z.array(resultSchema);

/** Polygons, each a list of rings ([lng, lat] points); outer and inner rings alike. */
export type RegionOutline = LngLat[][][];

export function buildRegionOutlineUrl(baseUrl: string, stateName: string): string {
  const params = new URLSearchParams({
    state: stateName,
    country: "India",
    featureType: "state",
    format: "jsonv2",
    polygon_geojson: "1",
    polygon_threshold: "0.005",
    limit: "1",
  });
  return `${baseUrl.replace(/\/$/, "")}/search?${params}`;
}

/** The state's polygons, or null unless the answer is a state boundary with an outline. */
export function parseRegionOutline(
  body: z.infer<typeof regionOutlineResponseSchema>,
): RegionOutline | null {
  const hit = body[0];
  if (
    !hit?.geojson ||
    hit.osm_type !== "relation" ||
    hit.category !== "boundary" ||
    hit.addresstype !== "state"
  ) {
    return null;
  }
  const ring = (r: number[][]): LngLat[] => r.map((p) => [p[0]!, p[1]!]);
  const g = hit.geojson;
  if (g.type === "Polygon") return [g.coordinates.map(ring)];
  if (g.type === "MultiPolygon") return g.coordinates.map((poly) => poly.map(ring));
  return null;
}

const throttle = createThrottle(1_100);

export async function fetchRegionOutline(
  baseUrl: string,
  userAgent: string,
  stateName: string,
): Promise<RegionOutline | null> {
  await throttle();
  const { status, data } = await fetchJson(
    "nominatim",
    buildRegionOutlineUrl(baseUrl, stateName),
    regionOutlineResponseSchema,
    { headers: { "User-Agent": userAgent } },
    30_000,
  );
  if (status !== 200) throw new ProviderError(`Nominatim HTTP ${status}`, "nominatim", status);
  return parseRegionOutline(data);
}
