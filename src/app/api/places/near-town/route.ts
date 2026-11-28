import { z } from "zod";
import { nearestTown } from "@/server/services/corridorService";

// A position is personal: never cached by browsers or CDNs, never logged.
const NO_STORE = { "Cache-Control": "private, no-store" };

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const querySchema = z.object({
  lng: z.coerce.number().min(-180).max(180).transform(round3),
  lat: z.coerce.number().min(-90).max(90).transform(round3),
});

/**
 * GET ?lng&lat -> { town: string | null }
 * The town to name the rider's position by in a trip ("Near Hassan", G10). The position is
 * rounded to 3 decimals (~100 m) on the way in, as for Near me.
 */
export async function GET(request: Request) {
  const parsed = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );
  if (!parsed.success) {
    return Response.json({ error: "Invalid request" }, { status: 400, headers: NO_STORE });
  }
  try {
    const town = await nearestTown([parsed.data.lng, parsed.data.lat]);
    return Response.json({ town }, { headers: NO_STORE });
  } catch (err) {
    console.error("GET /api/places/near-town failed:", err instanceof Error ? err.message : "error");
    return Response.json({ town: null }, { headers: NO_STORE });
  }
}
