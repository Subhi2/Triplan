import { expect, test, type Page } from "@playwright/test";
import type { LngLat } from "@/lib/geo";
import type { NearbyResponse, PlaceNear } from "@/lib/nearby";
import type { PlaceDetail } from "@/lib/placeDetail";
import type { GeocodeResult, RouteOption } from "@/lib/trip";
import { routeFixture } from "../helpers/fixtures";

// The Near me screen with its API mocked: no database, OSRM or tile server. The browser's
// position is Playwright's geolocation emulation. Server behaviour is covered by unit and
// integration tests (nearby*.test.ts, places-near-point.test.ts).

const SAKLESHPUR = { latitude: 12.94312, longitude: 75.78523 }; // 5 decimals: must be rounded
const THIS_MONTH = new Date().getMonth() + 1;

function place(p: Partial<PlaceNear> & Pick<PlaceNear, "id" | "name" | "location">): PlaceNear {
  return {
    slug: p.id,
    category: "fort",
    distanceKm: 5,
    roadKm: 6,
    rideMin: 8,
    bearingDeg: 0,
    rating: null,
    ratingCount: 0,
    bestMonths: [],
    bestMonthsEstimated: false,
    thumbUrl: null,
    trending: false,
    notable: true,
    fame: 2,
    ...p,
  };
}

const FORT = place({
  id: "manjarabad-fort",
  name: "Manjarabad Fort",
  location: [75.7581, 12.9173],
  distanceKm: 4,
  roadKm: 5.1,
  rideMin: 7.4,
  bearingDeg: 225,
  bestMonths: [THIS_MONTH],
});
// North-east of Sakleshpur, and south-west: for ride mode heading north.
const BELUR = place({
  id: "belur-chennakeshava",
  name: "Chennakeshava Temple, Belur",
  category: "temple",
  location: [75.865, 13.165],
  distanceKm: 25,
  roadKm: 35.3,
  rideMin: 41,
  bearingDeg: 19,
});
const BISLE = place({
  id: "bisle-ghat-viewpoint",
  name: "Bisle Ghat Viewpoint",
  category: "viewpoint",
  location: [75.6943, 12.7107],
  distanceKm: 27,
  roadKm: 46.5,
  rideMin: 49,
  bearingDeg: 200,
});

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
  guide: null,
  carry: [],
  estimate: null,
  media: [],
  googlePlaceId: null,
  videos: [],
  reviews: [],
  osm: { id: null, openingHours: null, fee: null, website: null, wikipediaUrl: null },
};

const TYPED: GeocodeResult = {
  id: "place/hassan",
  name: "Hassan",
  label: "Hassan",
  location: [76.0996, 13.0068],
  source: "local",
};

async function mockApis(
  page: Page,
  opts: { roadTimes?: NearbyResponse["roadTimes"]; nearRequests?: URLSearchParams[] } = {},
) {
  await page.route("**/api/places/near?**", (route) => {
    const params = new URL(route.request().url()).searchParams;
    opts.nearRequests?.push(params);
    const straight = opts.roadTimes === "straight" || params.get("mode") === "ride";
    const places = [FORT, BELUR, BISLE].map((p) =>
      straight ? { ...p, roadKm: null, rideMin: null } : p,
    );
    return route.fulfill({
      json: { places, roadTimes: straight ? "straight" : "osrm", radiusKm: 55 },
    });
  });
  await page.route("**/api/places/manjarabad-fort", (route) =>
    route.fulfill({ json: { place: FORT_DETAIL } }),
  );
  await page.route("**/api/geocode?**", (route) => route.fulfill({ json: { results: [TYPED] } }));
  await page.route("**/api/route", (route) => {
    const routes: RouteOption[] = routeFixture("bengaluru-sakleshpur-kalasa", "bike")
      .slice(0, 1)
      .map((r) => ({
        id: "sakleshpur-fort",
        geometry: r.geometry,
        distanceKm: 5.1,
        durationMin: 7,
        viaLabel: "",
        towns: [],
        roadMix: null,
        curvature: null,
      }));
    return route.fulfill({ json: { routes } });
  });
  await page.route("**/api/places/along", (route) => route.fulfill({ json: { places: [] } }));
  await page.route("**/api/weather", (route) => route.fulfill({ json: { points: [] } }));
  // No elevation profile, so tests never read the terrain tiles.
  await page.route("**/api/route/profile", (route) => route.fulfill({ json: { profile: null } }));
  await page.route("https://tiles.openfreemap.org/**", (route) =>
    route.fulfill({
      json: { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: {} }] },
    }),
  );
}

/** Counts every request for the position, to prove none happens without a tap. */
async function countLocationRequests(page: Page) {
  await page.addInitScript(() => {
    const g = navigator.geolocation;
    const w = window as unknown as { geoCalls: number };
    w.geoCalls = 0;
    const once = g.getCurrentPosition.bind(g);
    const watch = g.watchPosition.bind(g);
    g.getCurrentPosition = (...args) => {
      w.geoCalls++;
      once(...args);
    };
    g.watchPosition = (...args) => {
      w.geoCalls++;
      return watch(...args);
    };
  });
}

const locationRequests = (page: Page) =>
  page.evaluate(() => (window as unknown as { geoCalls: number }).geoCalls);

const rows = (page: Page) => page.getByRole("list", { name: "Places near you" }).locator("li");

test.describe("with location allowed", () => {
  test.use({ geolocation: SAKLESHPUR, permissions: ["geolocation"] });

  test("the planner links to Near me, which asks for the position only on a tap", async ({
    page,
  }) => {
    const nearRequests: URLSearchParams[] = [];
    await mockApis(page, { nearRequests });
    await countLocationRequests(page);
    await page.goto("/");
    // The planner writes its state to the URL once hydrated; a click before that would race it.
    await expect(page).toHaveURL(/v=bike/);
    await page.getByRole("link", { name: "Near me" }).click();
    // The dev server may compile /nearby on this first visit.
    await expect(page).toHaveURL(/\/nearby/, { timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Use my location" })).toBeVisible();
    expect(await locationRequests(page)).toBe(0);
    expect(nearRequests).toHaveLength(0);

    await page.getByRole("button", { name: "Use my location" }).click();
    await expect(rows(page)).toHaveCount(3);
    expect(await locationRequests(page)).toBe(1);

    // Rounded to 3 decimals in the request and the URL.
    const q = nearRequests.at(-1)!;
    expect([q.get("lng"), q.get("lat"), q.get("within"), q.get("vehicle")]).toEqual([
      "75.785",
      "12.943",
      "60",
      "bike",
    ]);
    await expect(page).toHaveURL(/at=75\.785%2C12\.943&within=60&v=bike/);
    expect(page.url()).not.toContain("75.7852");

    // Nearest first, led by the ride time; the fort is at its best this month.
    const first = rows(page).first();
    await expect(first).toHaveAttribute("data-name", "Manjarabad Fort");
    await expect(first).toHaveAttribute("data-ride-min", "7");
    await expect(first).toContainText("5.1 km by road");
    await expect(first).toHaveAttribute("data-in-season", "true");
    await expect(first).toContainText("In season");
    await expect(page.getByText("Places around")).toBeVisible();
    await expect(page.getByText("Your location", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "2 h" }).click();
    await expect.poll(() => nearRequests.at(-1)!.get("within")).toBe("120");
    await expect(page).toHaveURL(/within=120/);
    await expect(page.getByRole("heading", { name: "Within 2 hours by bike" })).toBeVisible();
  });

  test("falls back to straight-line distance and says so", async ({ page }) => {
    await mockApis(page, { roadTimes: "straight" });
    await page.goto("/nearby?at=75.785,12.943");
    await expect(page.getByText("Road times are unavailable right now")).toBeVisible();
    const first = rows(page).first();
    await expect(first).not.toHaveAttribute("data-ride-min", /.*/);
    await expect(first).toContainText("4.0 km away");
  });

  test("a shared link loads its places without asking for the position", async ({ page }) => {
    await mockApis(page);
    await countLocationRequests(page);
    await page.goto("/nearby?at=Sakleshpur@75.785,12.943&within=120&v=car");
    await expect(rows(page)).toHaveCount(3);
    await expect(page.getByText("Sakleshpur", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Within 2 hours by car" })).toBeVisible();
    expect(await locationRequests(page)).toBe(0);
  });

  test("ride there from a nearby place opens the planner and routes", async ({ page }) => {
    await mockApis(page);
    await page.goto("/nearby");
    await page.getByRole("button", { name: "Use my location" }).click();
    await rows(page).first().getByRole("button").first().click();
    await expect(page.getByRole("heading", { name: "Manjarabad Fort" })).toBeVisible();

    const routed = page.waitForRequest("**/api/route");
    await page.getByRole("link", { name: "Ride there" }).click();
    await expect(page).toHaveURL(/\/\?from=My\+location%4075\.785%2C12\.943&to=Manjarabad/);
    const body = (await routed).postDataJSON() as { stops: { label: string; location: LngLat }[] };
    expect(body.stops).toEqual([
      { label: "My location", location: [75.785, 12.943] },
      { label: "Manjarabad Fort", location: [75.7581, 12.9173] },
    ]);
  });

  test("the planner's start can be my location", async ({ page }) => {
    await mockApis(page);
    await page.goto("/");
    await page.getByRole("button", { name: "Use my location" }).click();
    await expect(page.getByRole("combobox", { name: "Start" })).toHaveValue("My location");
    await expect(page).toHaveURL(/from=My\+location%4075\.785%2C12\.943/);
  });

  test("ride mode shows the places ahead, not behind", async ({ page, context }) => {
    const nearRequests: URLSearchParams[] = [];
    await mockApis(page, { nearRequests });
    await page.goto("/nearby");
    await page.getByRole("button", { name: "Riding? See what's ahead" }).click();
    const dialog = page.getByRole("dialog", { name: "Ahead of you" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Start moving to find your direction.")).toBeVisible();

    // Ride north, 200 m at a time.
    for (let i = 1; i <= 3; i++) {
      await context.setGeolocation({ latitude: 12.943 + i * 0.002, longitude: 75.785 });
      await page.waitForTimeout(300);
    }
    const ahead = dialog.getByRole("list", { name: "Places ahead" }).locator("li");
    await expect(ahead).toHaveCount(1);
    await expect(ahead.first()).toHaveAttribute("data-name", "Chennakeshava Temple, Belur");
    await expect(dialog).toContainText("Heading N");
    expect(nearRequests[0]!.get("mode")).toBe("ride");
    expect(nearRequests[0]!.get("lng")).toBe("75.785");

    await dialog.getByRole("button", { name: "Stop" }).click();
    await expect(dialog).toBeHidden();
  });
});

test.describe("with location denied", () => {
  test.use({ permissions: [] });

  test("explains and offers the other ways to choose a point", async ({ page }) => {
    await mockApis(page);
    await page.goto("/nearby");
    await page.getByRole("button", { name: "Use my location" }).click();
    await expect(page.getByText(/Location is off for this site/)).toBeVisible();

    await page.getByRole("combobox", { name: "Search around a place" }).fill("Hass");
    await page.getByRole("option", { name: "Hassan" }).click();
    await expect(rows(page)).toHaveCount(3);
    await expect(page).toHaveURL(/at=Hassan%4076\.1%2C13\.007/);
  });
});

test("touch targets are large enough on phones", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "phone layout only");
  await mockApis(page);
  await page.goto("/nearby?at=75.785,12.943");
  await expect(rows(page)).toHaveCount(3);
  for (const name of ["30 min", "1 h", "2 h", "Half day", "Change", "Riding? See what's ahead"]) {
    const box = await page.getByRole("button", { name, exact: true }).boundingBox();
    expect(box!.height, name).toBeGreaterThanOrEqual(44);
  }
  await page.getByRole("button", { name: "Change" }).click();
  const input = page.getByRole("combobox", { name: "Search around a place" });
  const fontSize = await input.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(fontSize).toBeGreaterThanOrEqual(16);
  const locate = await page.getByRole("button", { name: "Use my location" }).boundingBox();
  expect(locate!.height).toBeGreaterThanOrEqual(44);
});
