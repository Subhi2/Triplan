import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { usageTotal } from "./usage";

export interface SiteStats {
  /** Verified places worth stopping for (not fuel stations or towns). */
  places: number;
  routesPlanned: number;
  tripsSaved: number;
}

/** The numbers on the About page. */
export async function getStats(): Promise<SiteStats> {
  const [[counts], routesPlanned] = await Promise.all([
    getDb().execute<{ places: number; trips: number }>(sql`
      SELECT
        (SELECT count(*)::int FROM place p JOIN category c ON c.id = p.category_id
          WHERE p.status = 'verified' AND c.slug NOT IN ('fuel', 'town')) AS places,
        (SELECT count(*)::int FROM trip) AS trips`),
    usageTotal("route_planned"),
  ]);
  return { places: counts?.places ?? 0, routesPlanned, tripsSaved: counts?.trips ?? 0 };
}
