import { z } from "zod";
import { round5 } from "./geo";
import { lineStringSchema } from "./places";
import {
  CORRIDOR_KM,
  tripRequestSchema,
  VEHICLES,
  type CorridorKm,
  type Stop,
  type Vehicle,
} from "./trip";

// Saved trips are open: no sign-in, no owners. Everyone sees, opens and updates the same list,
// and a trip's link (/trips/[id]) is its share link.

export const tripTitleSchema = z.string().trim().min(1).max(120);

/** What a trip is: its stops, vehicle and corridor, and the route the user picked. */
export const tripPlanSchema = z.object({
  stops: tripRequestSchema.shape.stops,
  vehicle: z.enum(VEHICLES),
  corridorKm: z.literal(CORRIDOR_KM),
  route: z.object({
    id: z.string().min(1).max(100),
    geometry: lineStringSchema,
    distanceKm: z.number().positive(),
    durationMin: z.number().nonnegative(),
    viaLabel: z.string().trim().min(1).max(200),
  }),
});

/** Body of POST /api/trips. */
export const createTripSchema = tripPlanSchema.extend({ title: tripTitleSchema });

/** Body of PATCH /api/trips/[id]: a new title, a new plan, or both. */
export const updateTripSchema = z
  .object({ title: tripTitleSchema.optional(), plan: tripPlanSchema.optional() })
  .refine((b) => b.title !== undefined || b.plan !== undefined, {
    message: "Send a title or a plan",
  });

export type TripPlan = z.infer<typeof tripPlanSchema>;
export type CreateTripRequest = z.infer<typeof createTripSchema>;
export type UpdateTripRequest = z.infer<typeof updateTripSchema>;

export const tripIdSchema = z.uuid();

export interface SavedTrip {
  id: string;
  title: string;
  vehicle: Vehicle;
  corridorKm: CorridorKm;
  stops: Stop[]; // start, vias, destination
  routeId: string | null; // the picked route, to select it again when the trip is reopened
  viaLabel: string | null;
  distanceKm: number | null;
  durationMin: number | null;
  updatedAt: string; // ISO
}

/** A row of the saved trips list (/trips). */
export interface TripSummary {
  id: string;
  title: string;
  vehicle: Vehicle;
  from: string;
  to: string;
  viaCount: number;
  viaLabel: string | null;
  distanceKm: number | null;
  durationMin: number | null;
  updatedAt: string; // ISO
}

const stopsKey = (stops: Stop[]) =>
  stops.map((s) => `${s.label}@${round5(s.location[0])},${round5(s.location[1])}`).join("|");

/** Whether the planner still shows the saved trip, or has changes that are not saved. */
export function isSavedPlan(saved: SavedTrip, plan: TripPlan): boolean {
  return (
    stopsKey(saved.stops) === stopsKey(plan.stops) &&
    saved.vehicle === plan.vehicle &&
    saved.corridorKm === plan.corridorKm &&
    saved.routeId === plan.route.id
  );
}
