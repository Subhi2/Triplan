import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { haversineM } from "@/lib/geo";
import type { GeocodeResult } from "@/lib/trip";
import { closeDb, getDb } from "@/server/db";
import { parsePhotonResponse, photonResponseSchema } from "@/server/providers/geocoding/photon";
import { searchPlacesByName } from "@/server/services/placeService";
import { suggestPlaces } from "@/server/services/suggestService";
import { jsonFixture } from "../helpers/fixtures";

// Suggestions while typing: our database for our places, recorded Photon responses
// (tests/fixtures/photon, `pnpm fixtures:photon`) for the rest. Photon itself is never called.

function suggest(query: string): Promise<GeocodeResult[]> {
  const photon = {
    search: async () =>
      parsePhotonResponse(photonResponseSchema.parse(jsonFixture(`photon/${query}.json`))),
  };
  return suggestPlaces(
    query,
    { near: [76.75, 15.05], zoom: 5 },
    { local: searchPlacesByName, photon },
  );
}

const named = (results: GeocodeResult[], name: string) => results.filter((r) => r.name === name);

let imported = new Set<string>();

describe.skipIf(!process.env.DATABASE_URL)("place suggestions", () => {
  beforeAll(async () => {
    const rows = await getDb().execute<{ state: string }>(
      sql`SELECT DISTINCT state FROM place WHERE source = 'osm'`,
    );
    imported = new Set(rows.map((r) => r.state));
  });
  afterAll(() => closeDb());

  it("samse: a village only Photon knows, first", async () => {
    const [first] = await suggest("samse");
    expect(first).toMatchObject({ name: "Samse", source: "photon" });
    expect(first!.label).toContain("Kalasa taluk");
  });

  it("kalasa: our town and places first, Photon's other Kalasas after, no duplicate", async () => {
    const results = await suggest("kalasa");
    expect(results[0]).toMatchObject({ name: "Kalasa", source: "local" });
    expect(results.map((r) => r.name)).toContain("Kalaseshwara Temple, Kalasa");
    const localCount = results.filter((r) => r.source === "local").length;
    expect(results.slice(0, localCount).every((r) => r.source === "local")).toBe(true);
    // Only one Kalasa near Kalasa (Photon's copy of our town is dropped); others are elsewhere.
    const kalasas = named(results, "Kalasa");
    expect(kalasas.filter((r) => haversineM(r.location, [75.356, 13.234]) < 3_000)).toHaveLength(1);
    expect(kalasas.length).toBeGreaterThan(1);
    // Loose fuzzy matches do not crowd out real ones.
    expect(results.map((r) => r.name)).not.toContain("Kalady");
  });

  it("ooty: Udhagamandalam first, found by its common name", async (ctx) => {
    if (!imported.has("Tamil Nadu")) ctx.skip();
    const results = await suggest("ooty");
    expect(results[0]).toMatchObject({ name: "Udhagamandalam", source: "local" });
    expect(named(results, "Udhagamandalam")).toHaveLength(1);
    expect(results.map((r) => r.name)).toContain("Ooty Lake");
  });

  it("sakleshpura: the misspelling still finds Sakleshpur, once", async () => {
    const results = await suggest("sakleshpura");
    expect(results[0]).toMatchObject({ name: "Sakleshpur", source: "local" });
    expect(named(results, "Sakleshpur")).toHaveLength(1);
  });
});
