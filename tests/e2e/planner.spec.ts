import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import type { PlaceDetail } from "@/lib/placeDetail";
import type { PlaceAlong } from "@/lib/places";
import type { SavedTrip } from "@/lib/savedTrip";
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

  // On phones the form folds away once the trip is complete, leaving the map and routes.
  await openTripForm(page);
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

test("suggests while typing, ours first, and falls back to Nominatim on Enter", async ({
  page,
}) => {
  const requests: URLSearchParams[] = [];
  await page.route("**/api/geocode?**", (route) => {
    const params = new URL(route.request().url()).searchParams;
    requests.push(params);
    const results: GeocodeResult[] =
      params.get("source") === "osm"
        ? [
            {
              id: "node/9",
              name: "Samse",
              label: "Samse, Karnataka",
              location: [75.33, 13.19],
              source: "osm",
            },
          ]
        : [
            {
              id: "place/samse-view",
              name: "Samse View",
              label: "Samse View, Karnataka",
              location: [75.33, 13.19],
              source: "local",
            },
            {
              id: "node/903206643",
              name: "Samse",
              label: "Samse, Kalasa taluk, Karnataka",
              location: [75.334, 13.188],
              source: "photon",
            },
          ];
    return route.fulfill({ json: { results } });
  });
  await page.goto("/");
  // The map only renders after hydration; keys typed before that are lost.
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  const start = page.getByRole("combobox", { name: "Start" });

  // Typing quickly sends one request, after the pause, with the map position as a bias.
  await start.pressSequentially("samse", { delay: 60 });
  const options = page.getByRole("listbox", { name: "Start suggestions" }).getByRole("option");
  await expect(options).toHaveCount(2);
  expect(requests).toHaveLength(1);
  expect(requests[0]!.get("q")).toBe("samse");
  expect(requests[0]!.get("source")).toBe("suggest");
  for (const key of ["lat", "lon", "zoom"]) expect(Number(requests[0]!.get(key))).not.toBeNaN();
  await expect(options.nth(0)).toContainText("Samse View"); // ours first
  await expect(options.nth(1)).toContainText("Kalasa taluk"); // then Photon
  await expect(page.getByText("Suggestions by Photon")).toBeVisible();

  // Enter without choosing a suggestion searches Nominatim.
  await start.press("Enter");
  await expect(page.getByText("Search by Nominatim")).toBeVisible();
  expect(requests.at(-1)!.get("source")).toBe("osm");
  await options.filter({ hasText: "Samse" }).first().click();
  await expect(start).toHaveValue("Samse");
});

const FORT: PlaceAlong = {
  id: "fort-id",
  slug: "manjarabad-fort",
  name: "Manjarabad Fort",
  category: "fort",
  location: [75.7581, 12.9173],
  kmFromStart: 244,
  detourKm: 1.6,
  rating: null,
  ratingCount: 0,
  bestMonths: [8, 9, 10, 11, 12, 1],
  thumbUrl: null,
  trending: false,
  notable: true,
};

const FORT_DETAIL: PlaceDetail = {
  id: FORT.id,
  slug: FORT.slug,
  name: FORT.name,
  category: "fort",
  location: FORT.location,
  district: "Hassan",
  state: "Karnataka",
  description: null,
  rating: null,
  ratingCount: 0,
  trending: false,
  guide: {
    bestVehicles: ["bike", "car"],
    lastMileNote: "Right off NH75; about 250 steps up.",
    roadCondition: null,
    bestMonths: [8, 9, 10, 11, 12, 1],
    okMonths: [2, 3, 6, 7],
    avoidMonths: [],
    bestTimeOfDay: null,
    visitDurationMin: 45,
    timings: null,
    entryFee: null,
    dressCode: null,
    permitNeeded: null,
    notes: null,
  },
  carry: [
    { slug: "raincoat", name: "Raincoat", months: [6, 7, 8, 9], reason: null },
    { slug: "grip_shoes", name: "Shoes with good grip", months: [], reason: null },
  ],
  media: [],
  externalRatings: [],
  videos: [],
  reviews: [],
  osm: { id: "relation/5419632", openingHours: null, fee: null, website: null, wikipediaUrl: null },
};

async function mockPlace(page: Page) {
  await page.route("**/api/places/along", (route) => route.fulfill({ json: { places: [FORT] } }));
  await page.route("**/api/places/manjarabad-fort", (route) =>
    route.fulfill({ json: { place: FORT_DETAIL } }),
  );
}

test("open a place's details, add it to the trip and remove it again", async ({ page }) => {
  const routeRequests: { stops: { label: string }[] }[] = [];
  await mockApis(page, routeRequests);
  await mockPlace(page);
  await page.goto("/?from=Bengaluru@77.5946,12.9716&to=Kalasa@75.356,13.234");

  const cards = page.getByRole("list", { name: "Route options" }).getByRole("button");
  await cards.filter({ hasText: "via Hassan, Sakleshpur" }).click();
  await page
    .getByRole("list", { name: "Places along the route" })
    .getByRole("button", { name: /Manjarabad Fort/ })
    .click();

  // The details, with every guide field shown, "Not known yet" when empty.
  await expect(page.getByRole("heading", { name: "Manjarabad Fort" })).toBeFocused();
  await expect(page.getByText("Right off NH75; about 250 steps up.")).toBeVisible();
  await expect(
    page.getByRole("list", { name: "Months to visit" }).getByRole("listitem"),
  ).toHaveCount(12);
  await expect(page.getByText("Best Aug–Jan · OK Feb–Mar, Jun–Jul")).toBeVisible();
  await expect(page.getByRole("list", { name: "Items to carry" })).toContainText("Raincoat");
  await expect(page.getByText("Not known yet").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Open full page" })).toHaveAttribute(
    "href",
    "/place/manjarabad-fort",
  );

  // Add to trip: a via stop between start and destination, and the route is recomputed.
  await page.getByRole("button", { name: "Add to trip" }).click();
  await expect(page.getByText("In your trip (stop 1)")).toBeVisible();
  await expect
    .poll(() => routeRequests.at(-1)?.stops.map((s) => s.label))
    .toEqual(["Bengaluru", "Manjarabad Fort", "Kalasa"]);
  await page.getByRole("button", { name: "Remove from trip" }).click();
  await expect(page.getByRole("button", { name: "Add to trip" })).toBeVisible();
  await expect.poll(() => routeRequests.at(-1)?.stops).toHaveLength(2);

  // Back to the list, with focus on the place's row.
  await page.getByRole("button", { name: "← All places" }).click();
  await expect(page.getByRole("button", { name: /Manjarabad Fort/ })).toBeFocused();
});

test("save the trip with its route, then see changes that are not saved", async ({ page }) => {
  await mockApis(page, []);
  const saves: Record<string, unknown>[] = [];
  await page.route("**/api/trips", (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    saves.push(body);
    const trip: SavedTrip = {
      id: "0b7e4b8e-2f4e-4c55-9d8e-3f1f5b0a9c11",
      title: body.title as string,
      vehicle: "bike",
      corridorKm: 5,
      stops: body.stops as SavedTrip["stops"],
      routeId: (body.route as { id: string }).id,
      viaLabel: "via Hassan, Sakleshpur",
      distanceKm: 330,
      durationMin: 400,
      updatedAt: new Date().toISOString(),
    };
    return route.fulfill({ status: 201, json: { trip } });
  });
  await page.goto("/?from=Bengaluru@77.5946,12.9716&to=Kalasa@75.356,13.234");

  // The selected route is saved with the trip, and the page moves to the trip's link.
  const cards = page.getByRole("list", { name: "Route options" }).getByRole("button");
  await cards.filter({ hasText: "via Hassan, Sakleshpur" }).click();
  // Before saving, WhatsApp shares the planner link, which holds the whole trip.
  const whatsApp = page.getByRole("link", { name: "WhatsApp" });
  const sharedText = async () =>
    new URL((await whatsApp.getAttribute("href"))!).searchParams.get("text");
  expect(await sharedText()).toMatch(
    /^Bengaluru → Kalasa · places along the route http:\/\/\S+\/\?from=Bengaluru/,
  );
  await page.getByRole("button", { name: "Save trip" }).click();
  const name = page.getByRole("textbox", { name: "Trip name" });
  await expect(name).toHaveValue("Bengaluru → Kalasa via Hassan, Sakleshpur");
  await name.fill("Coffee country");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved trip: Coffee country")).toBeVisible();
  await expect(page).toHaveURL(/\/trips\/0b7e4b8e-2f4e-4c55-9d8e-3f1f5b0a9c11\?from=/);
  // After saving, it shares the trip's own short link.
  expect(await sharedText()).toMatch(/\/trips\/0b7e4b8e-2f4e-4c55-9d8e-3f1f5b0a9c11$/);
  expect(saves[0]).toMatchObject({
    title: "Coffee country",
    vehicle: "bike",
    corridorKm: 5,
    route: { id: "bengaluru-kalasa-1", viaLabel: "via Hassan, Sakleshpur" },
    stops: [{ label: "Bengaluru" }, { label: "Kalasa" }],
  });

  // A change to the saved trip can be saved or kept as a new trip.
  await cards.filter({ hasText: "via Chikkamagaluru" }).click();
  await expect(page.getByText("Changes not saved.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save changes" })).toBeVisible();
});

test("tick places and open the trip in Google Maps with them as stops", async ({ page }) => {
  await mockApis(page, []);
  await mockPlace(page);
  await page.goto("/?from=Bengaluru@77.5946,12.9716&to=Kalasa@75.356,13.234");
  await page
    .getByRole("list", { name: "Route options" })
    .getByRole("button")
    .filter({ hasText: "via Hassan, Sakleshpur" })
    .click();

  const open = page.getByRole("region", { name: "Google Maps" }).getByRole("link", {
    name: "Open in Google Maps",
  });
  await expect(open).toHaveAttribute("href", /maps\/dir\/\?api=1&origin=12\.9716%2C77\.5946/);
  expect(await open.getAttribute("href")).not.toContain("waypoints");

  await page.getByRole("checkbox", { name: "Tick Manjarabad Fort for Google Maps" }).check();
  await expect(page.getByText("1 ticked")).toBeVisible();
  await expect(open).toHaveAttribute("href", /waypoints=12\.9173%2C75\.7581/);

  // The place's own page on Google Maps, for photos and reviews: on its row and in its details.
  await expect(
    page.getByRole("link", { name: "Open Manjarabad Fort in Google Maps" }),
  ).toHaveAttribute("href", /maps\/search\/Manjarabad%20Fort\/@12\.9173,75\.7581,17z/);
  await page
    .getByRole("list", { name: "Places along the route" })
    .getByRole("button", { name: /Manjarabad Fort/ })
    .click();
  await expect(page.getByRole("checkbox", { name: "Tick for Google Maps" })).toBeChecked();
  await expect(
    page.getByRole("article").getByRole("link", { name: "Open in Google Maps" }),
  ).toHaveAttribute("href", /maps\/search\/Manjarabad%20Fort\/@12\.9173,75\.7581,17z/);
});

test("on phones the map comes first, then a one-line header and the sheet", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "phone layout only");
  await mockApis(page, []);
  await page.goto("/");
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();

  // No empty sheet over the map before there is a trip.
  const sheet = page.locator('section[aria-label="Routes and places"]');
  await expect(sheet).toHaveAttribute("aria-hidden", "true");
  // 16 px text: iOS Safari zooms the page into smaller inputs.
  const start = page.getByRole("combobox", { name: "Start" });
  const fontPx = await start.evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
  expect(fontPx).toBeGreaterThanOrEqual(16);

  await choose(page, "Start", "Beng", "Bengaluru");
  await choose(page, "Destination", "Kala", "Kalasa");

  // The form folds away: the header shows the trip, and the sheet the routes.
  await expect(page.getByText("Bengaluru → Kalasa")).toBeVisible();
  await expect(start).toBeHidden();
  await expect(sheet).not.toHaveAttribute("aria-hidden", "true");
  await expect(page.getByRole("list", { name: "Route options" }).getByRole("button")).toHaveCount(
    2,
  );
  for (const target of [
    page.getByRole("button", { name: "Edit trip" }),
    page.getByRole("link", { name: "Trips" }),
  ]) {
    expect((await target.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
});

const pump = (name: string, kmFromStart: number): PlaceAlong => ({
  ...FORT,
  id: `pump-${kmFromStart}`,
  slug: `pump-${kmFromStart}`,
  name,
  category: "fuel",
  kmFromStart,
  detourKm: 0.2,
  notable: false,
});

test.describe("ride check", () => {
  // Sunset times depend on the clock; India's is the one riders use.
  test.use({ timezoneId: "Asia/Kolkata" });

  test("fuel gaps against the tank's range, and the arrival against sunset", async ({ page }) => {
    await mockApis(page, []);
    await page.route("**/api/places/along", (route) => {
      const body = route.request().postDataJSON() as { categories?: string[] };
      const places =
        body.categories?.[0] === "fuel"
          ? [pump("Nelamangala Fuels", 20), pump("Kunigal HP", 60), pump("Hassan IOCL", 250)]
          : [];
      return route.fulfill({ json: { places } });
    });
    await page.goto("/?from=Bengaluru@77.5946,12.9716&to=Kalasa@75.356,13.234");
    await page
      .getByRole("list", { name: "Route options" })
      .getByRole("button")
      .filter({ hasText: "via Hassan, Sakleshpur" })
      .click();

    // Folded to one line on phones, open on wide screens.
    const toggle = page.getByRole("button", { name: /^Ride check/ });
    await expect(toggle).toContainText(/Ride check/);
    if ((await toggle.getAttribute("aria-expanded")) === "false") {
      await expect(toggle).toContainText("Fuel gap 190 km");
      await toggle.click();
    }
    const check = page.getByRole("region", { name: "Ride check" });

    // Default range for a bike is 200 km: a 190 km stretch leaves too little reserve.
    await expect(check).toContainText("Fuel: fill up before a 190 km stretch");
    await expect(check).toContainText("From Kunigal HP (km 60) to Hassan IOCL (km 250)");
    await expect(check).toContainText("3 fuel stations within 2 km of the route");
    const range = check.getByRole("spinbutton", { name: "Range on a full tank (km)" });
    await range.fill("300");
    await expect(check).toContainText("Fuel: longest stretch without a pump is 190 km");
    await range.fill("150");
    await expect(check).toContainText("190 km without a pump, more than your range");

    const start = check.getByLabel("Start");
    await start.fill("2026-10-03T06:00");
    await expect(check).toContainText(/Daylight: arrive about .+, before dark/);
    await expect(check).toContainText(/Sunset at Kalasa: (6:\d\d\sPM|18:\d\d)/i);
    await start.fill("2026-10-03T15:00");
    await expect(check).toContainText("Daylight: you would ride after dark");
    await expect(check).toContainText(/Start by .+ to arrive an hour before sunset/);
  });
});

test("download the trip as a GPX file with the route, stops and places", async ({ page }) => {
  await mockApis(page, []);
  await mockPlace(page);
  await page.goto("/?from=Bengaluru@77.5946,12.9716&to=Kalasa@75.356,13.234");
  await page
    .getByRole("list", { name: "Route options" })
    .getByRole("button")
    .filter({ hasText: "via Hassan, Sakleshpur" })
    .click();
  await expect(
    page.getByRole("list", { name: "Places along the route" }).getByRole("button", {
      name: /Manjarabad Fort/,
    }),
  ).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download GPX file" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("bengaluru-to-kalasa.gpx");
  const gpx = await readFile((await download.path())!, "utf8");
  expect(gpx).toContain('<gpx version="1.1"');
  expect(gpx).toContain("<name>Bengaluru</name>");
  expect(gpx).toContain("<desc>Destination</desc>");
  expect(gpx).toContain("<name>Manjarabad Fort</name>");
  expect(gpx.match(/<trkpt /g)!.length).toBeGreaterThan(100);
});
