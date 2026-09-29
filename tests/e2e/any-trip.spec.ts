import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import type { RouteOption } from "@/lib/trip";
import { routeFixture, type RouteFixture } from "../helpers/fixtures";

// The app must work for any trip. Routing is mocked with recorded OSRM geometry; places and search
// come from the real database after `pnpm db:import-osm -- --region=all`.
config({ path: ".env.local", quiet: true });
test.skip(!process.env.DATABASE_URL, "needs a database with imported OSM places (DATABASE_URL)");

interface Trip {
  url: string;
  fixture: RouteFixture;
  labels: string[];
  states: string[]; // skipped until these are imported
}

let imported = new Set<string>();
test.beforeAll(async () => {
  const db = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
  const rows = await db<{ state: string }[]>`SELECT DISTINCT state FROM place WHERE source = 'osm'`;
  imported = new Set(rows.map((r) => r.state));
  await db.end();
});

const TRIPS: Record<string, Trip> = {
  "Bengaluru → Ooty": {
    url: "/?from=Bengaluru@77.5946,12.9716&to=Udhagamandalam@76.7031,11.4127",
    fixture: "bengaluru-ooty",
    labels: ["via Mysuru"],
    states: ["Karnataka", "Tamil Nadu"],
  },
  "Pune → Goa": {
    url: "/?from=Pune@73.8545,18.5214&to=Panaji@73.8282,15.499",
    fixture: "pune-goa",
    labels: ["Route 1", "Route 2"],
    states: ["Maharashtra", "Goa"],
  },
};

async function mockRouting(page: Page, trip: Trip) {
  // The weather comes from MET Norway; these tests never call it.
  await page.route("**/api/weather", (route) => route.fulfill({ json: { points: [] } }));
  const routes: RouteOption[] = routeFixture(trip.fixture, "bike").map((r, i) => ({
    id: `${trip.fixture}-${i}`, // not a cache id, so the client sends the geometry
    geometry: r.geometry,
    distanceKm: r.distanceM / 1000,
    durationMin: Math.round(r.durationS / 60),
    viaLabel: trip.labels[i]!,
    towns: [],
    roadMix: null,
  }));
  await page.route("**/api/route", (route) => route.fulfill({ json: { routes } }));
  await page.route("https://tiles.openfreemap.org/**", (route) =>
    route.fulfill({
      json: { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: {} }] },
    }),
  );
  return routes;
}

async function kmMarkers(page: Page): Promise<number[]> {
  const rows = page.getByRole("list", { name: "Places along the route" }).getByRole("button");
  await expect(rows.first()).toBeVisible({ timeout: 30_000 });
  return (await rows.allInnerTexts()).map((t) => Number(t.split("\n")[0]!.replace(" km", "")));
}

for (const [name, trip] of Object.entries(TRIPS)) {
  test(`${name}: best stops cover the whole route, and a category shows all of it`, async ({
    page,
  }) => {
    test.skip(
      !trip.states.every((s) => imported.has(s)),
      `import ${trip.states.join(" and ")} first`,
    );
    const routes = await mockRouting(page, trip);
    await page.goto(trip.url);

    const cards = page.getByRole("list", { name: "Route options" }).getByRole("button");
    await expect(cards).toHaveCount(routes.length);

    const km = routes[0]!.distanceKm;
    const best = await kmMarkers(page);
    expect(best.length).toBeGreaterThan(15);
    expect(best[0]).toBeLessThan(km * 0.1);
    expect(best.at(-1)).toBeGreaterThan(km * 0.9);
    await expect(page.getByRole("button", { name: /^Best stops/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByText(/Showing the best stops/)).toBeVisible();

    // Fuel stations are not listed, so there is no Fuel chip.
    await expect(page.getByRole("button", { name: /^Fuel/ })).toHaveCount(0);

    // Picking a category lists every place in it.
    const templeChip = page.getByRole("button", { name: /^Temple/ });
    const templeCount = Number((await templeChip.innerText()).replace(/\D/g, ""));
    await templeChip.click();
    await expect(
      page.getByRole("list", { name: "Places along the route" }).getByRole("button"),
    ).toHaveCount(templeCount);
  });
}

test("typing a common name finds the town by its alternative name", async ({ page }) => {
  await mockRouting(page, TRIPS["Bengaluru → Ooty"]!);
  await page.goto("/");
  await page.getByRole("combobox", { name: "Start" }).fill("Ooty");
  await expect(page.getByRole("option", { name: /Udhagamandalam/ }).first()).toBeVisible({
    timeout: 15_000,
  });
});
