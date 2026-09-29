import { expect, test, type Page } from "@playwright/test";
import type { GeocodeResult, RouteOption } from "@/lib/trip";
import { roadMix } from "@/server/services/roadMix";
import { routeFixture, type RouteFixture } from "../helpers/fixtures";

// The planner's own API is mocked with recorded OSRM geometry, so this never hits OSRM,
// Nominatim or the tile server. Server-side behaviour is covered by unit and integration tests.

const PLACES: GeocodeResult[] = [
  {
    id: "place/bengaluru",
    name: "Bengaluru",
    label: "Bengaluru",
    location: [77.5946, 12.9716],
    source: "local",
  },
  {
    id: "place/sakleshpur",
    name: "Sakleshpur",
    label: "Sakleshpur",
    location: [75.785, 12.943],
    source: "local",
  },
  {
    id: "place/kalasa",
    name: "Kalasa",
    label: "Kalasa",
    location: [75.356, 13.234],
    source: "local",
  },
];

function options(fixture: RouteFixture, labels: string[]): RouteOption[] {
  return routeFixture(fixture, "bike").map((r, i) => ({
    id: `${fixture}-${i}`,
    geometry: r.geometry,
    distanceKm: r.distanceM / 1000,
    durationMin: Math.round(r.durationS / 60),
    viaLabel: labels[i]!,
    towns: [],
    roadMix: roadMix(r),
  }));
}

async function mockApis(page: Page, routeRequests: unknown[]) {
  await page.route("**/api/geocode?**", (route) => {
    const q = new URL(route.request().url()).searchParams.get("q")!.toLowerCase();
    return route.fulfill({
      json: { results: PLACES.filter((p) => p.name.toLowerCase().includes(q)) },
    });
  });
  await page.route("**/api/route", (route) => {
    const body = route.request().postDataJSON() as { stops: unknown[] };
    routeRequests.push(body);
    const routes =
      body.stops.length === 2
        ? options("bengaluru-kalasa", ["via Chikkamagaluru", "via Hassan, Sakleshpur"])
        : options("bengaluru-sakleshpur-kalasa", ["via Sakleshpur"]);
    return route.fulfill({ json: { routes } });
  });
  await page.route("**/api/places/along", (route) => route.fulfill({ json: { places: [] } }));
  // A blank local map style instead of the network tile server.
  await page.route("https://tiles.openfreemap.org/**", (route) =>
    route.fulfill({
      json: { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: {} }] },
    }),
  );
}

/** On mobile a trip loaded from the URL folds the form away; open it like a rider would. */
async function openTripForm(page: Page) {
  const edit = page.getByRole("button", { name: "Edit trip" });
  if (await edit.isVisible()) await edit.click();
}

async function choose(page: Page, field: string, text: string, option: string) {
  await page.getByRole("combobox", { name: field }).fill(text);
  await page.getByRole("option", { name: option }).click();
}

test("plan Bengaluru → Kalasa, then force the route via Sakleshpur", async ({ page }) => {
  const routeRequests: unknown[] = [];
  await mockApis(page, routeRequests);
  await page.goto("/");

  await choose(page, "Start", "Beng", "Bengaluru");
  await choose(page, "Destination", "Kala", "Kalasa");

  const cards = page.getByRole("list", { name: "Route options" }).getByRole("button");
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toContainText("via Chikkamagaluru");
  await expect(cards.nth(0)).toContainText("337.6 km");
  await expect(cards.nth(1)).toContainText("via Hassan, Sakleshpur");
  // Each card splits the distance by kind of road.
  await expect(cards.nth(1)).toContainText(/NH \d+% · [\d.]+ km/);
  await expect(cards.nth(1)).toContainText(/Ghat \d+% · [\d.]+ km/);
  await expect(cards.nth(0)).toHaveAttribute("aria-pressed", "true");

  await cards.nth(1).click();
  await expect(cards.nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();

  await page.getByRole("button", { name: "+ Add stop" }).click();
  await choose(page, "Stop 1", "Sakl", "Sakleshpur");

  await expect(cards).toHaveCount(1);
  await expect(cards.nth(0)).toContainText("via Sakleshpur");
  await expect(cards.nth(0)).toContainText("330.8 km");
  expect(routeRequests.at(-1)).toEqual({
    stops: [
      { label: "Bengaluru", location: [77.5946, 12.9716] },
      { label: "Sakleshpur", location: [75.785, 12.943] },
      { label: "Kalasa", location: [75.356, 13.234] },
    ],
    vehicle: "bike",
  });

  // The trip is in the URL, so a reload (or a shared link) restores it.
  expect(decodeURIComponent(page.url())).toContain(
    "from=Bengaluru@77.5946,12.9716&via=Sakleshpur@75.785,12.943&to=Kalasa@75.356,13.234",
  );
  await page.reload();
  await expect(cards).toHaveCount(1);
  await openTripForm(page);
  await expect(page.getByRole("combobox", { name: "Stop 1" })).toHaveValue("Sakleshpur");
  await expect(cards).toHaveCount(1);
});

test("stops can be reordered from the keyboard", async ({ page }) => {
  await mockApis(page, []);
  await page.goto(
    "/?from=Bengaluru@77.5946,12.9716&via=Sakleshpur@75.785,12.943&to=Kalasa@75.356,13.234",
  );
  // Routes loading from the URL means the page is hydrated and the drag sensors are live.
  await expect(page.getByRole("list", { name: "Route options" }).getByRole("button")).toHaveCount(
    1,
  );
  await openTripForm(page);
  const handle = page.getByRole("button", { name: "Reorder Stop 1" });
  await handle.focus();
  // Each step waits for dnd-kit's screen reader announcement, so keys never race the drag.
  const announcement = page.locator('[id^="DndLiveRegion"]');
  await page.keyboard.press("Space");
  await expect(announcement).toHaveText(/^Picked up Sakleshpur\./);
  await page.keyboard.press("ArrowUp");
  await expect(announcement).toHaveText("Sakleshpur moved to position 1 of 3.");
  await page.keyboard.press("Space");
  await expect(announcement).toHaveText("Sakleshpur dropped at position 1 of 3.");
  await expect(page.getByRole("combobox", { name: "Start" })).toHaveValue("Sakleshpur");
  await expect(page.getByRole("combobox", { name: "Stop 1" })).toHaveValue("Bengaluru");
});
