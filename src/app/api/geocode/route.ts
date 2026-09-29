import { z } from "zod";
import type { GeocodeResult } from "@/lib/trip";
import { getGeocodingProvider } from "@/server/providers/geocoding";
import { suggestPlaces } from "@/server/services/suggestService";

const querySchema = z.object({
  q: z.string().trim().min(2).max(200),
  // suggest: our places, then Photon, while the rider types. osm: Nominatim, when Enter is pressed.
  source: z.enum(["suggest", "osm"]).default("suggest"),
  // Map centre and zoom, to prefer nearby suggestions.
  lat: z.coerce.number().min(-90).max(90).optional(),
  lon: z.coerce.number().min(-180).max(180).optional(),
  zoom: z.coerce.number().min(0).max(22).optional(),
});

/** GET ?q=&source=suggest|osm&lat=&lon=&zoom= -> { results: GeocodeResult[] } */
export async function GET(request: Request) {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid query", issues: z.flattenError(parsed.error) },
      { status: 400 },
    );
  }
  const { q, source, lat, lon, zoom } = parsed.data;

  try {
    let results: GeocodeResult[];
    if (source === "suggest") {
      const near =
        lat !== undefined && lon !== undefined ? ([lon, lat] as [number, number]) : undefined;
      results = await suggestPlaces(q, { near, zoom });
    } else {
      const hits = await getGeocodingProvider().search(q, { limit: 5 });
      results = hits.map((h) => ({
        id: h.id,
        name: h.name,
        label: h.label,
        location: h.location,
        source: "osm",
      }));
    }
    return Response.json(
      { results },
      { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=3600" } },
    );
  } catch (err) {
    console.error("GET /api/geocode failed", err);
    return Response.json({ error: "Search is unavailable" }, { status: 502 });
  }
}
