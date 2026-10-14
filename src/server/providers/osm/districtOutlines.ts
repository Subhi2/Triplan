import { z } from "zod";
import type { LngLat } from "@/lib/geo";
import { createThrottle, fetchJson, ProviderError } from "../http";
import type { RegionOutline } from "./regionOutline";

// District outlines from Nominatim's lookup (docs/02, "Alerts on the route"). Nominatim simplifies
// them on its side (polygon_threshold, in degrees), so a district is a few hundred points instead
// of the thousands in its member ways. 50 relations a request, at most 1 request a second
// (Nominatim's usage policy); a whole-India import is about 16 requests.

export const LOOKUP_BATCH = 50;
/** About 200 m: plenty to tell which districts a road passes through. */
const THRESHOLD_DEG = 0.002;

const ringSchema = z.array(z.tuple([z.number(), z.number()]).rest(z.number()));
const lookupSchema = z.array(
  z.object({
    osm_type: z.string(),
    osm_id: z.number(),
    geojson: z
      .discriminatedUnion("type", [
        z.object({ type: z.literal("Polygon"), coordinates: z.array(ringSchema) }),
        z.object({ type: z.literal("MultiPolygon"), coordinates: z.array(z.array(ringSchema)) }),
        z.object({ type: z.literal("Point"), coordinates: z.array(z.number()) }),
        z.object({ type: z.literal("LineString"), coordinates: z.array(z.array(z.number())) }),
      ])
      .optional(),
  }),
);

export function buildOutlineLookupUrl(baseUrl: string, relationIds: number[]): string {
  const params = new URLSearchParams({
    osm_ids: relationIds.map((id) => `R${id}`).join(","),
    format: "jsonv2",
    polygon_geojson: "1",
    polygon_threshold: String(THRESHOLD_DEG),
  });
  return `${baseUrl.replace(/\/$/, "")}/lookup?${params}`;
}

/** Relation id → its polygons (each a list of rings); relations without an area are left out. */
export function parseOutlineLookup(body: z.infer<typeof lookupSchema>): Map<number, RegionOutline> {
  const ring = (r: number[][]): LngLat[] => r.map((p) => [p[0]!, p[1]!]);
  const out = new Map<number, RegionOutline>();
  for (const hit of body) {
    const g = hit.geojson;
    if (hit.osm_type !== "relation" || !g) continue;
    if (g.type === "Polygon") out.set(hit.osm_id, [g.coordinates.map(ring)]);
    if (g.type === "MultiPolygon")
      out.set(
        hit.osm_id,
        g.coordinates.map((p) => p.map(ring)),
      );
  }
  return out;
}

const throttle = createThrottle(1_100);

export async function fetchDistrictOutlines(
  baseUrl: string,
  userAgent: string,
  relationIds: number[],
): Promise<Map<number, RegionOutline>> {
  if (relationIds.length > LOOKUP_BATCH) throw new Error(`At most ${LOOKUP_BATCH} ids a request`);
  await throttle();
  const { status, data } = await fetchJson(
    "nominatim",
    buildOutlineLookupUrl(baseUrl, relationIds),
    lookupSchema,
    { headers: { "User-Agent": userAgent } },
    60_000,
  );
  if (status !== 200) throw new ProviderError(`Nominatim HTTP ${status}`, "nominatim", status);
  return parseOutlineLookup(data);
}
