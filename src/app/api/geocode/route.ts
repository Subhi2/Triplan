import { z } from "zod";
import type { GeocodeResult } from "@/lib/trip";
import { getGeocodingProvider } from "@/server/providers/geocoding";
import { searchPlacesByName } from "@/server/services/placeService";

const querySchema = z.object({
  q: z.string().trim().min(2).max(200),
  // local: our places and towns, fine for type-ahead. osm: Nominatim, only on explicit search.
  source: z.enum(["local", "osm"]).default("local"),
});

/** GET ?q=&source=local|osm -> { results: GeocodeResult[] } */
export async function GET(request: Request) {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid query", issues: z.flattenError(parsed.error) },
      { status: 400 },
    );
  }
  const { q, source } = parsed.data;

  try {
    let results: GeocodeResult[];
    if (source === "local") {
      results = await searchPlacesByName(q);
    } else {
      const hits = await getGeocodingProvider().search(q, { limit: 5 });
      results = hits.map((h) => ({ ...h, source: "osm" }));
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
