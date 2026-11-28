import { z } from "zod";
import { lngLatSchema } from "./trip";

/** One line of a trip's packing list (G10, C3). */
export interface PackingItem {
  slug: string;
  name: string;
  /** The places on the trip that ask for it; empty for what every ride needs. */
  for: string[];
}

/** Body of POST /api/packing. */
export const packingRequestSchema = z.object({
  placeIds: z.array(z.uuid()).max(50),
  month: z.number().int().min(1).max(12),
  destination: lngLatSchema,
});
