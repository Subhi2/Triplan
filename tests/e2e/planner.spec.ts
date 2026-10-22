import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { routeCurvature } from "@/lib/curvature";
import type { ElevationProfile } from "@/lib/elevation";
import type { DayPlan } from "@/lib/multiDay";
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

/** A made-up profile: flat, a 900 m climb from km 280 to 298, then down into Kalasa. */
const PROFILE: ElevationProfile = {
  v: 1,
  zoom: 12,
  points: Array.from({ length: 34 }, (_, i): [number, number] => {
    const km = i * 10;
    return [km, km < 280 ? 900 : km < 300 ? 900 + (km - 280) * 45 : 1800 - (km - 300) * 30];
  }),
  ascentM: 1662,
  descentM: 1761,
  highest: { km: 300, m: 1800 },
  lowest: { km: 0, m: 900 },
  climbs: [{ fromKm: 280, toKm: 298, gainM: 900, gradePct: 5, dir: "up", near: "Kottigehara" }],
};

/** Two hospitals and an ATM near the road; the longest stretch without a hospital is 200 km. */
const SAFETY = {
  totalKm: 330.8,
  counts: { hospital: 2, police: 0, atm: 1, tyre: 0, repair: 0 },
  perFiftyKm: { hospital: 0.3, police: 0, atm: 0.2, tyre: 0, repair: 0 },
  longestGap: {
    hospital: { fromKm: 120, toKm: 320, km: 200 },
    police: { fromKm: 0, toKm: 330.8, km: 330.8 },
    atm: { fromKm: 50, toKm: 330.8, km: 280.8 },
    tyre: { fromKm: 0, toKm: 330.8, km: 330.8 },
    repair: { fromKm: 0, toKm: 330.8, km: 330.8 },
  },
  points: [
    {
      id: "node/1",
      kind: "atm",
      name: "SBI ATM",
      phone: null,
      location: [77.3, 13.0],
      kmFromStart: 50,
      detourKm: 0.1,
    },
    {
      id: "node/2",
      kind: "hospital",
      name: "Hassan Hospital",
      phone: "+91 8172 268 000",
      location: [76.1, 13.0],
      kmFromStart: 120,
      detourKm: 0.4,
    },
    {
      id: "node/3",
      kind: "hospital",
      name: "Kalasa Clinic",
      phone: null,
      location: [75.36, 13.23],
      kmFromStart: 320,
      detourKm: 1.2,
    },
  ],
  tolls: [
    {
      id: "node/10",
      name: "Nelamangala Toll Plaza",
      location: [77.39, 13.08],
      kmFromStart: 31.5,
    },
  ],
};

/** Bengaluru → Kalasa via Sakleshpur over two days, a night in Hassan. */
const DAYS: DayPlan = {
  suggestedDays: 2,
  days: 2,
  hoursPerDay: 4,
  legs: [
    {
      day: 1,
      fromKm: 0,
      toKm: 180,
      rideMin: 170,
      end: {
        name: "Hassan",
        kind: "city",
        location: [76.1, 13.0],
        kmFromStart: 180,
        stayCount: 42,
        stays: [
          {
            id: "node/9",
            name: "Hotel Hoysala Village",
            phone: "+91 8172 256 764",
            location: [76.1, 13.01],
            distanceKm: 0.8,
            slug: null,
          },
        ],
      },
    },
    {
      day: 2,
      fromKm: 180,
      toKm: 330.8,
      rideMin: 130,
      end: {
        name: null,
        kind: "destination",
        location: [75.356, 13.234],
        kmFromStart: 330.8,
        stayCount: 0,
        stays: [],
      },
    },
  ],
};

function options(fixture: RouteFixture, labels: string[]): RouteOption[] {
  return routeFixture(fixture, "bike").map((r, i) => ({
    id: `${fixture}-${i}`,
    geometry: r.geometry,
    distanceKm: r.distanceM / 1000,
    durationMin: Math.round(r.durationS / 60),
    viaLabel: labels[i]!,
    towns: [],
    roadMix: roadMix(r),
    curvature: routeCurvature(r.geometry),
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
  await page.route("**/api/services/along", (route) => route.fulfill({ json: SAFETY }));
  await page.route("**/api/route/days", (route) => route.fulfill({ json: DAYS }));
  // Never the terrain tiles: one made-up profile for every route.
  await page.route("**/api/route/profile", (route) =>
    route.fulfill({ json: { profile: PROFILE } }),
  );
  // No forecast (as if the trip were too far ahead), so tests never reach MET Norway.
  await page.route("**/api/weather", (route) => route.fulfill({ json: { points: [] } }));
  // No official alerts, so tests never read NDMA's SACHET.
  await page.route("**/api/route/alerts", (route) =>
    route.fulfill({ json: { alerts: [], partial: false } }),
  );
  // No road rules: these tests never read the database for them.
  await page.route("**/api/route/rules", (route) =>
    route.fulfill({ json: { rules: [], timeline: null } }),
  );
  // No terrain tiles for the 3D preview: it carries on with a flat map.
  await page.route("https://s3.amazonaws.com/elevation-tiles-prod/**", (route) =>
    route.fulfill({ status: 404, body: "" }),
  );
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
  await page.getByRole("button", { name: "Add a stop" }).click();
  await choose(page, "Stop 1", "Sakl", "Sakleshpur");

  await expect(cards).toHaveCount(1);
  await expect(cards.nth(0)).toContainText("via Sakleshpur");
  // The ghats to Kalasa: hairpins worked out from the road's shape.
  await expect(cards.nth(0).locator("[data-hairpins]")).toContainText(/\d+ hairpins/);
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

test("a failed request offers Try again instead of a dead end", async ({ page }) => {
  await mockApis(page, []);
  // The routing server and then the place list are down until Try again is pressed. (A switch,
  // not a count of calls: in development React runs each effect twice, so requests come twice.)
  let routeDown = true;
  await page.route("**/api/route", (route) =>
    routeDown
      ? route.fulfill({ status: 502, json: { error: "The routing service is unavailable" } })
      : route.fallback(),
  );
  // Only the place list's request (the ride check asks for fuel stations on its own).
  let placesDown = true;
  await page.route("**/api/places/along", (route) => {
    const body = route.request().postDataJSON() as { categories?: string[] };
    return !body.categories && placesDown
      ? route.fulfill({ status: 500, json: { error: "Could not load places" } })
      : route.fallback();
  });
  await page.goto("/?from=Bengaluru@77.5946,12.9716&to=Kalasa@75.356,13.234");

  await expect(page.getByText("The routing service is unavailable")).toBeVisible();
  routeDown = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("list", { name: "Route options" }).getByRole("button")).toHaveCount(
    2,
  );

  await expect(page.getByText("Could not load places")).toBeVisible();
  placesDown = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("Could not load places")).toBeHidden();
});

test("ride through a town on the picked route to keep to that road", async ({ page }) => {
  const routeRequests: { stops: { label: string }[] }[] = [];
  await mockApis(page, routeRequests);
  // The Hassan route passes Hassan and Sakleshpur (the mock has no towns otherwise).
  await page.route("**/api/route", async (route) => {
    const body = route.request().postDataJSON() as { stops: unknown[] };
    if (body.stops.length !== 2) return route.fallback();
    routeRequests.push(body as { stops: { label: string }[] });
    const routes = options("bengaluru-kalasa", ["via Chikkamagaluru", "via Hassan, Sakleshpur"]);
    routes[1] = {
      ...routes[1]!,
      towns: ["Hassan", "Sakleshpur"],
      townStops: [
        { name: "Hassan", location: [76.0996, 13.0072] },
        { name: "Sakleshpur", location: [75.785, 12.943] },
      ],
    };
    return route.fulfill({ json: { routes } });
  });
  await page.goto("/?from=Bengaluru@77.5946,12.9716&to=Kalasa@75.356,13.234");

  const cards = page.getByRole("list", { name: "Route options" }).getByRole("button");
  await cards.filter({ hasText: "via Hassan, Sakleshpur" }).click();
  await page.getByRole("button", { name: "Sakleshpur", exact: true }).click();

  // Sakleshpur is a stop now, so the trip keeps to that road.
  await expect
    .poll(() => routeRequests.at(-1)?.stops.map((s) => s.label))
    .toEqual(["Bengaluru", "Sakleshpur", "Kalasa"]);
  await expect(cards).toHaveCount(1);
  await expect(cards.nth(0)).toContainText("via Sakleshpur");
});

test("the route's ups and downs, scrubbed from the keyboard", async ({ page }) => {
  await mockApis(page, []);
  await page.goto(
    "/?from=Bengaluru@77.5946,12.9716&via=Sakleshpur@75.785,12.943&to=Kalasa@75.356,13.234",
  );
  const cards = page.getByRole("list", { name: "Route options" }).getByRole("button");
  await expect(cards).toHaveCount(1);
  await expect(cards.nth(0).locator("[data-climb]")).toContainText("↑ 1,662 m");
  await expect(page.getByRole("heading", { name: "Ups and downs" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Big climbs and descents" })).toContainText(
    "900 m up in 18.0 km · 5% · to Kottigehara",
  );

  const chart = page.getByRole("slider", { name: "Height along the route" });
  await chart.focus();
  await expect(chart).toHaveAttribute("aria-valuetext", "km 0.0, 900 m");
  await page.keyboard.press("End");
  await expect(chart).toHaveAttribute("aria-valuetext", "km 330.0, 900 m");
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+ArrowRight"); // a tenth of the way
  await expect(chart).toHaveAttribute("aria-valuetext", "km 33.0, 900 m");
});

test.describe("3D ride preview", () => {
  const TRIP =
    "/?from=Bengaluru@77.5946,12.9716&via=Sakleshpur@75.785,12.943&to=Kalasa@75.356,13.234";

  test("rides the route from the start and closes with Escape", async ({ page }) => {
    await mockApis(page, []);
    await page.goto(TRIP);
    await page.getByRole("button", { name: "Preview the ride in 3D" }).click();
    const dialog = page.getByRole("dialog", {
      name: /3D ride preview: Bengaluru → Kalasa via Sakleshpur/,
    });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Close the preview" })).toBeFocused();
    await expect(dialog.getByText(/of 331/)).toBeVisible();
    // The camera moves on by itself.
    await expect(dialog.locator("[data-hud-km]")).not.toHaveText("0.0", { timeout: 20_000 });
    // Chromium has the video encoder, so the ride can be saved as a video.
    await expect(dialog.getByRole("button", { name: "Save video" })).toBeVisible();
    await dialog.getByRole("button", { name: "Pause" }).click();
    await dialog.getByRole("slider", { name: "Position along the route" }).fill("3000");
    await expect(dialog.locator("[data-hud-km]")).toHaveText("300.0");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("waits to be played when the rider asked for reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await mockApis(page, []);
    await page.goto(TRIP);
    await page.getByRole("button", { name: "Preview the ride in 3D" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("button", { name: "Play", exact: true })).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(dialog.locator("[data-hud-km]")).toHaveText("0.0");
  });
});

test("open the ride story poster and download it", async ({ page }) => {
  await mockApis(page, []);
  const storyRequests: string[] = [];
  await page.route("**/og/story?**", (route) => {
    storyRequests.push(route.request().url());
    // A 1×1 PNG stands in for the poster.
    return route.fulfill({
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
        "base64",
      ),
    });
  });
  await page.goto(
    "/?from=Bengaluru@77.5946,12.9716&via=Sakleshpur@75.785,12.943&to=Kalasa@75.356,13.234",
  );
  await page.getByRole("button", { name: "Ride story" }).click();
  const dialog = page.getByRole("dialog", { name: "Ride story" });
  await expect(
    dialog.getByRole("img", { name: /Ride story poster: Bengaluru → Kalasa/ }),
  ).toBeVisible();
  expect(decodeURIComponent(storyRequests[0]!)).toMatch(
    /\/og\/story\?route=bengaluru-sakleshpur-kalasa-0&from=Bengaluru@77\.5946,12\.9716&via=Sakleshpur/,
  );
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Download" }).click();
  expect((await download).suggestedFilename()).toBe("story-bengaluru-kalasa-via-sakleshpur.png");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("safety stops along the road, with call links and the hospital gap", async ({ page }) => {
  await mockApis(page, []);
  await page.goto(
    "/?from=Bengaluru@77.5946,12.9716&via=Sakleshpur@75.785,12.943&to=Kalasa@75.356,13.234",
  );
  // The helplines lead: 112 everywhere, 1033 because the road is NH75.
  const lines = page.getByRole("list", { name: "Helplines" });
  await expect(lines.getByRole("link", { name: /112/ })).toHaveAttribute("href", "tel:112");
  await expect(lines.getByRole("link", { name: /1033/ })).toHaveAttribute("href", "tel:1033");
  const kinds = page.getByRole("group", { name: "Kinds of safety stop" });
  await expect(kinds).toContainText("2 hospitals");
  await expect(kinds).toContainText("1 ATM");
  await kinds.getByRole("button", { name: /hospitals/ }).click();
  const list = page.getByRole("list", { name: "hospitals" });
  await expect(list).toContainText("Hassan Hospital");
  await expect(list.getByRole("link", { name: "Call" })).toHaveAttribute(
    "href",
    "tel:+918172268000",
  );
  await expect(page.getByText("longest stretch without one 200 km (km 120–320)")).toBeVisible();

  const check = page.getByRole("region", { name: /Ride check/ });
  if (!(await check.getByText(/Hospitals: longest stretch/).isVisible())) {
    await check.getByRole("button", { name: /Ride check/ }).click();
  }
  await expect(check.getByText("Hospitals: longest stretch without one is 200 km")).toBeVisible();
});

test("split a long ride into days, each night in a town with stays", async ({ page }) => {
  const dayRequests: unknown[] = [];
  const routeRequests: { stops: { label: string }[] }[] = [];
  await mockApis(page, routeRequests);
  await mockPlace(page);
  await page.route("**/api/route/days", (route) => {
    dayRequests.push(route.request().postDataJSON());
    return route.fulfill({ json: DAYS });
  });
  // Five hours of riding at four a day: two days.
  await page.goto(
    "/?from=Bengaluru@77.5946,12.9716&via=Sakleshpur@75.785,12.943&to=Kalasa@75.356,13.234&rh=4",
  );
  await expect(page.getByRole("heading", { name: "Over 2 days" })).toBeVisible();
  const days = page.getByRole("list", { name: "Days of riding" });
  await expect(days).toContainText("Night in Hassan · 42 stays within 5 km");
  await expect(days).toContainText("Arrive in Kalasa");
  await expect(days.getByRole("link", { name: "Call" })).toHaveAttribute(
    "href",
    "tel:+918172256764",
  );
  expect(dayRequests[0]).toMatchObject({ hoursPerDay: 4 });
  expect(dayRequests[0]).not.toHaveProperty("days");
  await expect(page.getByRole("list", { name: "Places along the route" })).toContainText(
    "Night in Hassan · day 2",
  );

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download GPX file" }).click(),
  ]);
  const gpx = await readFile((await download.path())!, "utf8");
  expect(gpx.match(/<trk>/g)).toHaveLength(2);
  expect(gpx).toContain("<name>Day 1: Bengaluru → Hassan</name>");
  expect(gpx).toContain("<name>Hotel Hoysala Village</name>");

  await page.getByRole("button", { name: "One day more" }).click();
  await expect(page).toHaveURL(/[?&]d=3/);
  await expect.poll(() => dayRequests.at(-1)).toMatchObject({ days: 3 });
  await page.getByRole("button", { name: "One day fewer" }).click();
  await expect(page).not.toHaveURL(/[?&]d=/);

  // The night's town becomes a stop, in road order.
  await page.getByRole("button", { name: "Stop here" }).click();
  await expect
    .poll(() => routeRequests.at(-1)?.stops.map((s) => s.label))
    .toEqual(["Bengaluru", "Hassan", "Sakleshpur", "Kalasa"]);
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
  bestMonthsEstimated: false,
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
  descriptionCredit: null,
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
  estimate: null,
  media: [],
  googlePlaceId: null,
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
  await page.getByRole("button", { name: "All places" }).click();
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
    return route.fulfill({ status: 201, json: { trip, editToken: "test-edit-token" } });
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

  // This device saved it, so it may rename it and save changes, with the trip's edit token.
  await expect(page.getByRole("button", { name: "Rename" })).toBeVisible();
  await cards.filter({ hasText: "via Chikkamagaluru" }).click();
  await expect(page.getByText("Changes not saved.")).toBeVisible();
  const patch = page.waitForRequest((r) => r.method() === "PATCH");
  await page.route("**/api/trips/*", (route) => route.fulfill({ status: 500, json: {} }));
  await page.getByRole("button", { name: "Save changes" }).click();
  expect((await patch).headers()["authorization"]).toBe("Bearer test-edit-token");
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

test("time for stops ticks the best sights that fit, and a second tap clears them", async ({
  page,
}) => {
  await mockApis(page, []);
  const temple: PlaceAlong = {
    ...FORT,
    id: "temple-id",
    slug: "hasanamba-temple",
    name: "Hasanamba Temple",
    category: "temple",
    location: [76.0977, 13.0049],
    kmFromStart: 201,
    detourKm: 0.3,
  };
  const trek: PlaceAlong = {
    ...FORT,
    id: "trek-id",
    slug: "long-trek",
    name: "Long Trek",
    category: "trek",
    kmFromStart: 300,
    detourKm: 1,
  };
  await page.route("**/api/places/along", (route) =>
    route.fulfill({ json: { places: [temple, FORT, trek] } }),
  );
  await page.goto("/?from=Bengaluru@77.5946,12.9716&to=Kalasa@75.356,13.234");
  await page
    .getByRole("list", { name: "Route options" })
    .getByRole("button")
    .filter({ hasText: "via Hassan, Sakleshpur" })
    .click();

  const times = page.getByRole("group", { name: "Time for stops" });
  await times.getByRole("button", { name: "2 h" }).click();
  await expect(times.getByRole("button", { name: "2 h" })).toHaveAttribute("aria-pressed", "true");
  // The temple (31 min) and the fort (65 min) fit in 2 hours; the 2-hour trek does not.
  await expect(
    page.getByRole("status").filter({ hasText: "Ticked the 2 best stops" }),
  ).toContainText("about 1 h 36 min");
  await expect(
    page.getByRole("checkbox", { name: "Tick Manjarabad Fort for Google Maps" }),
  ).toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: "Tick Hasanamba Temple for Google Maps" }),
  ).toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: "Tick Long Trek for Google Maps" }),
  ).not.toBeChecked();
  await expect(page.getByText("2 ticked")).toBeVisible();

  await times.getByRole("button", { name: "2 h" }).click();
  await expect(
    page.getByRole("checkbox", { name: "Tick Manjarabad Fort for Google Maps" }),
  ).not.toBeChecked();
  await expect(page.getByText("2 ticked")).toBeHidden();
});

test("Popular keeps the well-known stops and Offbeat the lesser-known", async ({ page }) => {
  await mockApis(page, []);
  const quiet: PlaceAlong = {
    ...FORT,
    id: "quiet-id",
    slug: "quiet-viewpoint",
    name: "Quiet Viewpoint",
    category: "viewpoint",
    kmFromStart: 120,
    notable: false,
  };
  await page.route("**/api/places/along", (route) =>
    route.fulfill({ json: { places: [quiet, FORT] } }),
  );
  await page.goto("/?from=Bengaluru@77.5946,12.9716&to=Kalasa@75.356,13.234");
  await page
    .getByRole("list", { name: "Route options" })
    .getByRole("button")
    .filter({ hasText: "via Hassan, Sakleshpur" })
    .click();

  const list = page.getByRole("list", { name: "Places along the route" });
  const mixes = page.getByRole("group", { name: "Popular or offbeat" });
  await expect(mixes.getByRole("button", { name: "Mixed" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(list.getByRole("button", { name: /Quiet Viewpoint/ })).toBeVisible();
  await expect(list.getByRole("button", { name: /Manjarabad Fort/ })).toBeVisible();

  await mixes.getByRole("button", { name: "Offbeat" }).click();
  await expect(list.getByRole("button", { name: /Manjarabad Fort/ })).toBeHidden();
  await expect(list.getByRole("button", { name: /Quiet Viewpoint/ })).toBeVisible();

  await mixes.getByRole("button", { name: "Popular" }).click();
  await expect(list.getByRole("button", { name: /Quiet Viewpoint/ })).toBeHidden();
  await expect(list.getByRole("button", { name: /Manjarabad Fort/ })).toBeVisible();

  // A category shows every place in it, so the mix steps aside.
  await page
    .getByRole("group", { name: "Filter by category" })
    .getByRole("button", { name: /Viewpoint/ })
    .click();
  await expect(mixes).toBeHidden();
  await expect(list.getByRole("button", { name: /Quiet Viewpoint/ })).toBeVisible();
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
    page.getByRole("button", { name: "More" }),
  ]) {
    expect((await target.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  // The other screens stay reachable with a trip loaded.
  await page.getByRole("button", { name: "More" }).click();
  for (const name of ["Famous rides", "Your trips", "About"]) {
    await expect(page.getByRole("link", { name })).toBeVisible();
  }
  await page.keyboard.press("Escape");
  await expect(page.getByRole("link", { name: "Famous rides" })).toBeHidden();
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

    // Weather along the way, at the time the rider gets to each point.
    await page.unroute("**/api/weather");
    const weatherAt = (label: string, eta: string, rain: string, rainMm: number) => ({
      km: 0,
      label,
      location: [75.8, 12.95],
      eta,
      forecast: { tempC: 24, windMs: 2, rainMm, rainHours: 1, symbol: rain, rain, thunder: false },
    });
    await page.route("**/api/weather", (route) =>
      route.fulfill({
        json: {
          points: [
            weatherAt("start", "2026-10-03T00:30:00Z", "dry", 0),
            weatherAt("Sakleshpur", "2026-10-03T04:30:00Z", "rain", 2.5),
            weatherAt("end", "2026-10-03T06:00:00Z", "light", 0.4),
          ],
        },
      }),
    );
    await start.fill("2026-10-03T06:00");
    await expect(check).toContainText("Weather: rain near Sakleshpur around 10:00");
    const along = check.getByRole("list", { name: "Weather along the route" });
    await expect(along.getByRole("listitem")).toHaveCount(3);
    await expect(along.getByRole("listitem").first()).toContainText("Bengaluru · 24 °C · dry");
    await expect(along.getByRole("listitem").last()).toContainText("Kalasa");
    await expect(check).toContainText("Forecast by MET Norway (CC BY 4.0)");
  });
});

test("official alerts in force during the ride show under the routes and in the ride check", async ({
  page,
}) => {
  await mockApis(page, []);
  await page.unroute("**/api/route/alerts");
  const hours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
  const alert = (id: string, event: string, severity: string, onset: string, expires: string) => ({
    id,
    event,
    headline: `${event} is likely over Chikkamagaluru district.`,
    severity,
    urgency: "Expected",
    certainty: "Likely",
    issuer: "IMD Bengaluru",
    area: "Chikkamagaluru",
    onset,
    expires,
    kmFromStart: 254.2,
    url: "https://sachet.example/alert",
  });
  await page.route("**/api/route/alerts", (route) =>
    route.fulfill({
      json: {
        alerts: [
          alert("rain", "Heavy Rain", "Severe", hours(-1), hours(72)),
          // Over before the ride starts (06:00 tomorrow by default): not shown.
          alert("storm", "Thunderstorm", "Moderate", hours(-2), hours(1)),
        ],
        partial: false,
      },
    }),
  );
  await page.goto("/?from=Bengaluru@77.5946,12.9716&to=Kalasa@75.356,13.234");
  await page
    .getByRole("list", { name: "Route options" })
    .getByRole("button")
    .filter({ hasText: "via Hassan, Sakleshpur" })
    .click();

  const banner = page.getByRole("region", { name: "Official alerts on the route" });
  await expect(banner).toContainText("Severe alert · Heavy Rain · from km 254");
  await expect(banner).toContainText("IMD Bengaluru");
  await expect(banner).not.toContainText("Thunderstorm");
  await banner.getByRole("button").click();
  await expect(banner).toContainText("Heavy Rain is likely over Chikkamagaluru district.");

  // Folded to one line on phones, with the alert counted in it.
  const toggle = page.getByRole("button", { name: /^Ride check/ });
  await expect(toggle).toContainText(/Ride check/);
  if ((await toggle.getAttribute("aria-expanded")) === "false") {
    await expect(toggle).toContainText("1 alert");
    await toggle.click();
  }
  const check = page.getByRole("region", { name: "Ride check" });
  await expect(check).toContainText("Official alert: heavy rain on the way");
  await expect(check.getByRole("list", { name: "Official alerts while you ride" })).toContainText(
    "Severe · Heavy Rain · from km 254",
  );
  await expect(check).toContainText("NDMA's SACHET");

  // A start after the alert ends: nothing to show.
  const later = new Date(Date.now() + 5 * 86_400_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  await check
    .getByLabel("Start")
    .fill(`${later.getFullYear()}-${pad(later.getMonth() + 1)}-${pad(later.getDate())}T06:00`);
  await expect(banner).toHaveCount(0);
  await expect(check).toContainText("Official alerts: none on the way while you ride");
});

test("a night ban on the road is checked against the start time, and permits are listed", async ({
  page,
}) => {
  await mockApis(page, []);
  await page.unroute("**/api/route/rules");
  const rule = {
    slug: "forest-night",
    kind: "night_ban",
    title: "Forest road",
    kmFrom: 200,
    kmTo: 240,
    closedFrom: "21:00",
    closedTo: "06:00",
    vehicles: [],
    months: [],
    link: "https://example.org/ban",
    source: "A newspaper, 2025",
    checkedOn: "2026-10-14",
    note: null,
  };
  const epass = {
    ...rule,
    slug: "hills-epass",
    kind: "epass",
    title: "E-pass needed to drive into the hills",
    closedFrom: null,
    closedTo: null,
    source: null,
    link: "https://epass.example.org/",
  };
  await page.route("**/api/route/rules", (route) =>
    route.fulfill({ json: { rules: [rule, epass], timeline: null } }),
  );
  await page.goto("/?from=Bengaluru@77.5946,12.9716&to=Kalasa@75.356,13.234");
  await page
    .getByRole("list", { name: "Route options" })
    .getByRole("button")
    .filter({ hasText: "via Hassan, Sakleshpur" })
    .click();

  const toggle = page.getByRole("button", { name: /^Ride check/ });
  await expect(toggle).toContainText(/Ride check/);
  if ((await toggle.getAttribute("aria-expanded")) === "false") {
    await expect(toggle).toContainText(/Fuel/);
    await toggle.click();
  }
  const check = page.getByRole("region", { name: "Ride check" });
  const start = check.getByLabel("Start");

  await start.fill("2026-10-03T18:00");
  await expect(check).toContainText("Forest road is closed when you get there");
  await expect(check).toContainText(
    /Closed 9 pm–6 am. Start by .+ to get through before it closes/,
  );
  await expect(check).toContainText("A newspaper, 2025");
  await expect(check).toContainText("checked 14 Oct 2026");

  await start.fill("2026-10-03T06:00");
  await expect(check).toContainText("Forest road: open when you pass");
  await expect(check).toContainText("E-pass needed to drive into the hills");
  await expect(check).toContainText("Apply before you go.");
  await expect(check.getByRole("link", { name: "epass.example.org" })).toBeVisible();
});

test("suggests a break near each 2 hours, and a tap ticks it", async ({ page }) => {
  await mockApis(page, []);
  await page.unroute("**/api/places/along");
  const cafe = {
    id: "place/ghat-cafe",
    slug: "ghat-cafe",
    name: "Ghat Cafe",
    category: "coffee",
    location: [75.7, 13.0],
    kmFromStart: 135,
    detourKm: 0.2,
    rating: null,
    ratingCount: 0,
    bestMonths: [],
    bestMonthsEstimated: false,
    thumbUrl: null,
    trending: false,
    notable: false,
  };
  const dhaba = {
    ...cafe,
    id: "place/highway-dhaba",
    slug: "highway-dhaba",
    name: "Highway Dhaba",
    category: "food",
    kmFromStart: 245,
  };
  await page.route("**/api/places/along", (route) => {
    const body = route.request().postDataJSON() as { categories?: string[] };
    const places = body.categories?.includes("coffee") ? [cafe, dhaba] : [];
    return route.fulfill({ json: { places } });
  });
  await page.goto("/?from=Bengaluru@77.5946,12.9716&to=Kalasa@75.356,13.234");
  await page
    .getByRole("list", { name: "Route options" })
    .getByRole("button")
    .filter({ hasText: "via Hassan, Sakleshpur" })
    .click();

  const toggle = page.getByRole("button", { name: /^Ride check/ });
  if ((await toggle.getAttribute("aria-expanded")) === "false") await toggle.click();
  const check = page.getByRole("region", { name: "Ride check" });
  const breaks = check.getByRole("list", { name: "Suggested breaks" });
  await expect(breaks).toContainText("Ghat Cafe");
  await expect(breaks).toContainText("Highway Dhaba");

  const cup = page.getByRole("button", { name: "Break at Ghat Cafe, km 135" });
  await cup.click();
  await expect(cup).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("region", { name: "Google Maps" })).toContainText("1 ticked");
});

test("every route card has a scenic score, and the most scenic slower one is labelled", async ({
  page,
}) => {
  await mockApis(page, []);
  await page.unroute("**/api/route");
  await page.route("**/api/route", (route) => {
    const routes = options("bengaluru-kalasa", ["via Chikkamagaluru", "via Hassan, Sakleshpur"]);
    // Chikkamagaluru (259 min) is the fastest; Sakleshpur scores 3 more.
    routes[0]!.scenic = { score: 3, sights: 4 };
    routes[1]!.scenic = { score: 6, sights: 9 };
    return route.fulfill({ json: { routes } });
  });
  await page.goto("/?from=Bengaluru@77.5946,12.9716&to=Kalasa@75.356,13.234");

  const cards = page.getByRole("list", { name: "Route options" }).getByRole("button");
  const chik = cards.filter({ hasText: "via Chikkamagaluru" });
  const sak = cards.filter({ hasText: "via Hassan, Sakleshpur" });
  await expect(chik).toContainText("Scenic 3/10");
  await expect(sak).toContainText("Scenic 6/10");
  await expect(sak.getByText("Scenic", { exact: true })).toBeVisible();
  await expect(chik.getByText("Scenic", { exact: true })).toHaveCount(0);
});

test("open a GPX ride: only the line is sent, without its ends, and a reload keeps it", async ({
  page,
}) => {
  await mockApis(page, []);
  // A 12 km ride north from 13.00° N; its first and last 500 m must stay on the phone.
  const points = Array.from({ length: 121 }, (_, i) => [
    75.5 + Math.sin(i / 8) * 0.004,
    13 + i * 0.0009,
  ]);
  const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>Charmadi morning</name><trkseg>
${points.map(([lng, lat]) => `    <trkpt lat="${lat!.toFixed(6)}" lon="${lng!.toFixed(6)}"></trkpt>`).join("\n")}
  </trkseg></trk>
</gpx>`;
  const [, sak] = options("bengaluru-kalasa", ["via Chikkamagaluru", "via Hassan, Sakleshpur"]);
  const ride = { ...sak!, id: `${"a".repeat(32)}-0`, viaLabel: "Your ride", roadMix: null };
  const uploads: { geometry: { coordinates: [number, number][] } }[] = [];
  const reads: string[] = [];
  await page.route("**/api/route/upload**", (route) => {
    if (route.request().method() === "POST") {
      uploads.push(route.request().postDataJSON());
      return route.fulfill({ json: { route: ride } });
    }
    reads.push(route.request().url());
    return route.fulfill({ json: { route: ride } });
  });
  const routing: unknown[] = [];
  page.on("request", (r) => {
    if (r.url().endsWith("/api/route") && r.method() === "POST") routing.push(r.url());
  });
  await page.goto("/");

  await page.getByTestId("ride-file").setInputFiles({
    name: "charmadi.gpx",
    mimeType: "application/gpx+xml",
    buffer: Buffer.from(gpx),
  });
  const cards = page.getByRole("list", { name: "Route options" }).getByRole("button");
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText("Charmadi morning");
  expect(routing).toHaveLength(0); // the ride stands in for routing

  // No point within 500 m of either end left the phone.
  const sent = uploads[0]!.geometry.coordinates;
  const metres = ([a, b]: number[], [c, d]: number[]) =>
    Math.hypot((a! - c!) * 111_320 * Math.cos((b! * Math.PI) / 180), (b! - d!) * 110_574);
  for (const p of sent) {
    expect(metres(p, points[0]!)).toBeGreaterThan(490);
    expect(metres(p, points.at(-1)!)).toBeGreaterThan(490);
  }
  await expect(page).toHaveURL(/gpx=a{32}-0/);

  // A reload asks for the ride by its id instead of routing between its ends.
  await page.reload();
  await expect(cards.first()).toContainText("Your ride");
  expect(reads.at(-1)).toContain(`id=${"a".repeat(32)}-0`);
});

test("save a trip for offline, then open it with no signal", async ({ page }) => {
  await mockApis(page, []);
  await page.route("**/api/places/along", (route) => route.fulfill({ json: { places: [FORT] } }));
  // Our own map file, answered from an 11-tile fixture with range requests, as storage does.
  const file = await readFile("tests/fixtures/pmtiles/corridor.pmtiles");
  await page.route("https://offline-tiles.test/**", (route) => {
    if (!route.request().url().endsWith(".pmtiles"))
      return route.fulfill({ status: 404, body: "" });
    const m = /bytes=(d+)-(d+)/.exec(route.request().headers()["range"] ?? "");
    const start = m ? Number(m[1]) : 0;
    const end = Math.min(m ? Number(m[2]) : file.length - 1, file.length - 1);
    return route.fulfill({
      status: 206,
      headers: {
        "Content-Range": `bytes ${start}-${end}/${file.length}`,
        "Content-Type": "application/octet-stream",
      },
      body: file.subarray(start, end + 1),
    });
  });
  await page.goto("/?from=Bengaluru@77.5946,12.9716&to=Kalasa@75.356,13.234");
  await page
    .getByRole("list", { name: "Route options" })
    .getByRole("button")
    .filter({ hasText: "via Hassan, Sakleshpur" })
    .click();

  const offline = page.getByRole("region", { name: "Offline" });
  await offline.getByRole("button", { name: "Save for offline" }).click();
  await expect(offline.getByRole("status")).toContainText("Saved for offline", { timeout: 20_000 });
  // The 11 tiles of the file that lie along the road, in the pack's own cache.
  const kept = await page.evaluate(async () => {
    const name = (await caches.keys()).find((n) => n.startsWith("pack-"));
    return name ? (await (await caches.open(name)).keys()).length : 0;
  });
  expect(kept).toBe(11);

  await page.goto("/trips");
  const packs = page.getByRole("region", { name: "Saved for offline" });
  await expect(packs).toContainText("Bengaluru → Kalasa");

  // No signal from here on: every API call and the map file fail.
  await page.route("**/api/**", (route) => route.abort());
  await page.route("https://offline-tiles.test/**", (route) => route.abort());
  await packs.getByRole("link", { name: /Bengaluru → Kalasa/ }).click();
  await expect(page).toHaveURL(/pack=/);
  await expect(page.getByText("Opened from the copy saved on this phone")).toBeVisible();
  await expect(page.getByRole("list", { name: "Route options" }).getByRole("button")).toContainText(
    "via Hassan, Sakleshpur",
  );
  await expect(
    page
      .getByRole("list", { name: "Places along the route" })
      .getByRole("button", { name: /Manjarabad Fort/ }),
  ).toBeVisible();
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
});

test("the last trip planned stays on the phone and opens with no signal", async ({ page }) => {
  await mockApis(page, []);
  await page.route("**/api/places/along", (route) => route.fulfill({ json: { places: [FORT] } }));
  await page.goto("/?from=Bengaluru@77.5946,12.9716&to=Kalasa@75.356,13.234");
  await page
    .getByRole("list", { name: "Route options" })
    .getByRole("button")
    .filter({ hasText: "via Hassan, Sakleshpur" })
    .click();
  await expect(
    page
      .getByRole("list", { name: "Places along the route" })
      .getByRole("button", { name: /Manjarabad Fort/ }),
  ).toBeVisible();
  // Kept a second after it settles.
  await page.waitForTimeout(1500);

  await page.goto("/trips");
  const last = page.getByRole("region", { name: "Your last trip" });
  await expect(last).toContainText("Bengaluru → Kalasa");
  await page.route("**/api/**", (route) => route.abort());
  await last.getByRole("link").click();
  await expect(page.getByText("Your last trip, kept on this phone")).toBeVisible();
  await expect(page.getByRole("list", { name: "Route options" }).getByRole("button")).toContainText(
    "via Hassan, Sakleshpur",
  );
  await expect(
    page
      .getByRole("list", { name: "Places along the route" })
      .getByRole("button", { name: /Manjarabad Fort/ }),
  ).toBeVisible();
});

test("a sunset stop near the end of the ride, with the time to leave by", async ({ page }) => {
  await mockApis(page, []);
  const view: PlaceAlong = {
    ...FORT,
    id: "view-id",
    slug: "kanive-viewpoint",
    name: "Kanive Viewpoint",
    category: "viewpoint",
    location: [75.4, 13.2],
    kmFromStart: 300,
    detourKm: 2.6,
    notable: false,
  };
  await page.route("**/api/places/along", (route) =>
    route.fulfill({ json: { places: [FORT, view] } }),
  );
  await page.goto("/?from=Bengaluru@77.5946,12.9716&to=Kalasa@75.356,13.234");
  await page
    .getByRole("list", { name: "Route options" })
    .getByRole("button")
    .filter({ hasText: "via Hassan, Sakleshpur" })
    .click();

  const toggle = page.getByRole("button", { name: /^Ride check/ });
  if ((await toggle.getAttribute("aria-expanded")) === "false") await toggle.click();
  const check = page.getByRole("region", { name: "Ride check" });
  await expect(check).toContainText("Sunset stop: Kanive Viewpoint");
  const stop = check.getByRole("list", { name: "Sunset stops" }).getByRole("button");
  await expect(stop).toContainText(/km 300 · sunset \d{1,2}:\d{2}/);
  await expect(stop).toContainText(/Leave by \d{1,2}:\d{2}/);
  await stop.click();
  await expect(stop).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("region", { name: "Google Maps" })).toContainText("1 ticked");
});

for (const vehicle of ["bike", "car"] as const) {
  test(`tolls by ${vehicle}, and the fuel cost from the rider's mileage and price`, async ({
    page,
  }) => {
    await mockApis(page, []);
    await page.goto(`/?from=Bengaluru@77.5946,12.9716&to=Kalasa@75.356,13.234&v=${vehicle}`);
    await page
      .getByRole("list", { name: "Route options" })
      .getByRole("button")
      .filter({ hasText: "via Hassan, Sakleshpur" })
      .click();
    const toggle = page.getByRole("button", { name: /^Ride check/ });
    if ((await toggle.getAttribute("aria-expanded")) === "false") await toggle.click();
    const check = page.getByRole("region", { name: "Ride check" });

    if (vehicle === "bike") {
      await expect(check).toContainText("No tolls: two-wheelers ride national highways free");
      await expect(check.getByRole("list", { name: "Toll plazas on the route" })).toHaveCount(0);
    } else {
      await expect(check).toContainText("Tolls: 1 toll plaza on the route");
      await expect(check.getByRole("list", { name: "Toll plazas on the route" })).toContainText(
        "km 32 · Nelamangala Toll Plaza",
      );
      await expect(check).toContainText("FASTag annual pass is ₹3,000 for 200");
    }

    await check.getByLabel("Mileage (km per litre)").fill("35");
    await check.getByLabel("Fuel price (₹ per litre)").fill("103");
    await expect(check).toContainText(/Fuel cost: about ₹9\d0 for 3\d\d km/);
    // Remembered for this vehicle on the next visit.
    await page.reload();
    await page
      .getByRole("list", { name: "Route options" })
      .getByRole("button")
      .filter({ hasText: "via Hassan, Sakleshpur" })
      .click();
    if ((await toggle.getAttribute("aria-expanded")) === "false") await toggle.click();
    await expect(check.getByLabel("Mileage (km per litre)")).toHaveValue("35");
  });
}

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
