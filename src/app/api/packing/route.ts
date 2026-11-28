import { z } from "zod";
import { packingRequestSchema } from "@/lib/packing";
import { packingFor } from "@/server/services/packingService";

/**
 * POST { placeIds, month, destination } -> { items: PackingItem[] }
 * The packing list for a trip (G10): what its places say to carry in the month of the ride, and
 * what every ride needs.
 */
export async function POST(request: Request) {
  const parsed = packingRequestSchema.safeParse(await request.json().catch(() => undefined));
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request", issues: z.flattenError(parsed.error) },
      { status: 400 },
    );
  }
  try {
    const { placeIds, month, destination } = parsed.data;
    return Response.json({ items: await packingFor(placeIds, month, destination) });
  } catch (err) {
    console.error("POST /api/packing failed", err);
    return Response.json({ error: "Could not make the list" }, { status: 500 });
  }
}
