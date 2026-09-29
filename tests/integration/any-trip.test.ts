import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PLACE_LIST_CATEGORIES } from "@/lib/categories";
import { bestAlongRoute, type PlaceAlong } from "@/lib/places";
import { closeDb, getDb } from "@/server/db";
import { placesAlong, toPlaceAlong } from "@/server/services/corridorService";
import { getRoutes, townsAlongDb } from "@/server/services/routeService";
import type { LngLat } from "@/lib/geo";
import { routeFixture, type RouteFixture } from "../helpers/fixtures";

// The app must work for any trip, not just the Bengaluru → Kalasa demo. These run on recorded OSRM
// routes against the database after `pnpm db:import-osm -- --region=all`; each trip is skipped
// until the states it crosses have been imported.

interface Trip {
  name: string;
  fixture: RouteFixture;
  stops: [string, LngLat][];
  states: string[];
  labels: string[];
  /** Well-known places that must be in the full 5 km list of the first route. */
  expected: string[];
}

const TRIPS: Trip[] = [
  {
    name: "Bengaluru → Kalasa",
    fixture: "bengaluru-kalasa",
    stops: [
      ["Bengaluru", [77.5946, 12.9716]],
      ["Kalasa", [75.356, 13.234]],
    ],
    states: ["Karnataka"],
    labels: ["via Chikkamagaluru", "via Hassan, Sakleshpur"],
    expected: ["Kalaseshwara Temple, Kalasa", "Ballalarayana Durga", "Banavara Fort"],
  },
  {
    name: "Bengaluru → Ooty",
    fixture: "bengaluru-ooty",
    stops: [
      ["Bengaluru", [77.5946, 12.9716]],
      ["Udhagamandalam", [76.7031, 11.4127]],
    ],
    states: ["Karnataka", "Tamil Nadu"],
    labels: ["via Mysuru"],
    expected: ["Mysore Palace", "Ranganathittu Bird Sanctuary", "Pykara Waterfalls", "Doddabetta"],
  },
  {
    name: "Pune → Goa",
    fixture: "pune-goa",
    stops: [
      ["Pune", [73.8545, 18.5214]],
      ["Panaji", [73.8282, 15.499]],
    ],
    states: ["Maharashtra", "Goa"],
    labels: ["via Phaltan, Gadahinglaj", "via Nippani"],
    expected: [],
  },
];

const CORRIDOR_M = 5_000;
// OpenStreetMap's fuel coverage has real holes, so this checks that fuel was imported along the
// route, not that it is never far away: Pune → Goa via Phaltan has 185 km without a mapped
// station (OSM has 10 in a 100 × 65 km box there), Bengaluru → Ooty 93 km (Bandipur–Mudumalai).
const MIN_FUEL_PER_100_KM = 10;

let imported = new Set<string>();

describe.skipIf(!process.env.DATABASE_URL)("places for any trip", () => {
  beforeAll(async () => {
    const rows = await getDb().execute<{ state: string }>(
      sql`SELECT DISTINCT state FROM place WHERE source = 'osm' AND status = 'verified'`,
    );
    imported = new Set(rows.map((r) => r.state));
  });
  afterAll(() => closeDb());

  for (const trip of TRIPS) {
    describe(trip.name, () => {
      const routes = routeFixture(trip.fixture);

      it("returns a sensible place list along the whole route", async (ctx) => {
        if (!trip.states.every((s) => imported.has(s))) ctx.skip();
        for (const route of routes) {
          const km = route.distanceM / 1000;
          // What the app lists: every category except fuel stations and towns.
          const places: PlaceAlong[] = (
            await placesAlong(route.geometry, CORRIDOR_M, PLACE_LIST_CATEGORIES)
          ).map(toPlaceAlong);

          // Plenty to see, of several kinds, and no fuel stations.
          expect(places.length).toBeGreaterThan(40);
          expect(new Set(places.map((p) => p.category)).size).toBeGreaterThanOrEqual(5);
          expect(places.some((p) => p.category === "fuel" || p.category === "town")).toBe(false);

          // Ordered by km, inside the corridor, and covering the whole route (not cut off).
          const kms = places.map((p) => p.kmFromStart);
          expect(kms).toEqual([...kms].sort((a, b) => a - b));
          expect(places.every((p) => p.detourKm <= CORRIDOR_M / 1000 + 0.1)).toBe(true);
          expect(kms[0]).toBeLessThan(km * 0.1);
          expect(kms.at(-1)).toBeGreaterThan(km * 0.9);

          // The default list is readable: at most 5 per 10 km.
          const best = bestAlongRoute(places);
          expect(best.length).toBeLessThanOrEqual(Math.ceil(km / 10) * 5);

          // Fuel stations are not listed but are still imported, for the planned fuel-range
          // planner, from the start of the route to its end.
          const fuel = (await placesAlong(route.geometry, CORRIDOR_M, ["fuel"])).map(
            (p) => p.kmFromStart,
          );
          expect(fuel.length).toBeGreaterThan((km / 100) * MIN_FUEL_PER_100_KM);
          expect(fuel[0]).toBeLessThan(km * 0.1);
          expect(fuel.at(-1)).toBeGreaterThan(km * 0.9);
        }

        const first = (
          await placesAlong(routes[0]!.geometry, CORRIDOR_M, PLACE_LIST_CATEGORIES)
        ).map((p) => p.name);
        expect(first).toEqual(expect.arrayContaining(trip.expected));
      });

      it("labels the routes with towns on them", async (ctx) => {
        if (!trip.states.every((s) => imported.has(s)) || trip.labels.length === 0) ctx.skip();
        const options = await getRoutes(
          { stops: trip.stops.map(([label, location]) => ({ label, location })), vehicle: "bike" },
          {
            routing: { route: async () => routes },
            townsAlong: townsAlongDb,
            townsInBox: async () => [],
          },
        );
        expect(options.map((o) => o.viaLabel)).toEqual(trip.labels);
      });
    });
  }
});
