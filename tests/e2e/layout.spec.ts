import { expect, test, type Page } from "@playwright/test";
import { routeCurvature } from "@/lib/curvature";
import type { RouteOption } from "@/lib/trip";
import { roadMix } from "@/server/services/roadMix";
import { axeFaults } from "../helpers/axe";
import { routeFixture } from "../helpers/fixtures";
import { layoutFaults } from "../helpers/layoutAudit";

// Layout guard (docs/08-design.md, "Layers and panels"): every key screen, at phone and laptop
// size, with no sideways scroll, nothing sticking out, no control under another layer or cut off
// by its box, and 40 px targets on phones. The Menu is checked open, where there is one.

const TRIP = "/?from=Bengaluru@77.5946,12.9716&to=Kalasa@75.356,13.234";

/** The planner's APIs answered here: no OSRM, weather, alerts or tile server. */
async function mockTrip(page: Page) {
  const routes: RouteOption[] = routeFixture("bengaluru-kalasa", "bike").map((r, i) => ({
    id: `layout-${i}`,
    geometry: r.geometry,
    distanceKm: r.distanceM / 1000,
    durationMin: Math.round(r.durationS / 60),
    viaLabel: ["via Chikkamagaluru", "via Hassan, Sakleshpur"][i] ?? `route ${i + 1}`,
    towns: [],
    roadMix: roadMix(r),
    curvature: routeCurvature(r.geometry),
  }));
  await page.route("**/api/route", (route) => route.fulfill({ json: { routes } }));
  await page.route("**/api/places/along", (route) => route.fulfill({ json: { places: [] } }));
  // Safety stops and the day split show their "could not load" state, which is laid out too.
  await page.route("**/api/services/along", (route) =>
    route.fulfill({ status: 503, json: { error: "Not in this test" } }),
  );
  await page.route("**/api/route/days", (route) =>
    route.fulfill({ status: 503, json: { error: "Not in this test" } }),
  );
  await page.route("**/api/route/profile", (route) => route.fulfill({ json: { profile: null } }));
  await page.route("**/api/weather", (route) => route.fulfill({ json: { points: [] } }));
  await page.route("**/api/route/alerts", (route) =>
    route.fulfill({ json: { alerts: [], partial: false } }),
  );
  await page.route("**/api/route/rules", (route) =>
    route.fulfill({ json: { rules: [], timeline: null } }),
  );
  await page.route("**/api/route/reports", (route) => route.fulfill({ json: { reports: [] } }));
  await page.route("https://tiles.openfreemap.org/**", (route) =>
    route.fulfill({
      json: { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: {} }] },
    }),
  );
}

/**
 * The screen is free of layout faults once it settles: entrances slide in (a list from the side,
 * a sheet from below), so a fault counts only if it lasts.
 */
async function expectClean(page: Page, where: string) {
  await expect
    .poll(() => layoutFaults(page), { message: `layout faults on ${where}` })
    .toEqual({
      overflowX: 0,
      wide: [],
      covered: [],
      cut: [],
      small: [],
    });
}

/** Opens the Menu (if this screen has one in view), checks it, and closes it again. */
async function checkMenu(page: Page, where: string) {
  const menu = page.getByRole("button", { name: /^Menu/ }).first();
  if (!(await menu.isVisible())) return;
  const links = page.locator("[popover]:popover-open").getByRole("link");
  // The planner and Near me render their phone layout first and switch on laptops once their
  // scripts run, which can move the button from under a click: click again until it opens.
  await expect(async () => {
    if (!(await links.first().isVisible())) await menu.click();
    await expect(links.first()).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 10_000 });
  // Every entry takes a tap: nothing (the phone sheet, the map) lies over the list.
  for (const link of await links.all()) await link.click({ trial: true });
  await expectClean(page, `${where} with the Menu open`);
  await page.keyboard.press("Escape");
  await expect(links.first()).toBeHidden();
}

const PAGES: { path: string; ready: (page: Page) => Promise<void> }[] = [
  {
    path: "/",
    ready: (page) => expect(page.getByRole("combobox", { name: "Start" })).toBeVisible(),
  },
  {
    path: "/rides",
    ready: (page) => expect(page.getByRole("heading", { name: "Famous rides" })).toBeVisible(),
  },
  {
    path: "/rides/pollachi-to-valparai",
    ready: (page) => expect(page.getByRole("heading", { level: 1 })).toBeVisible(),
  },
  {
    path: "/place/manjarabad-fort",
    ready: (page) =>
      expect(page.getByRole("heading", { name: "Manjarabad Fort", level: 1 })).toBeVisible(),
  },
  {
    path: "/nearby",
    ready: (page) => expect(page.getByRole("button", { name: "Use my location" })).toBeVisible(),
  },
  {
    path: "/trips",
    ready: (page) => expect(page.getByRole("heading", { level: 1 })).toBeVisible(),
  },
  {
    path: "/clubs",
    ready: (page) => expect(page.getByRole("heading", { level: 1 })).toBeVisible(),
  },
  {
    path: "/group-rides",
    ready: (page) => expect(page.getByRole("heading", { level: 1 })).toBeVisible(),
  },
  {
    path: "/bucket-list",
    ready: (page) => expect(page.getByRole("heading", { level: 1 })).toBeVisible(),
  },
  {
    path: "/about",
    ready: (page) => expect(page.getByRole("heading", { level: 1 })).toBeVisible(),
  },
  {
    path: "/terms",
    ready: (page) => expect(page.getByRole("heading", { name: "Terms", level: 1 })).toBeVisible(),
  },
];

for (const { path, ready } of PAGES) {
  test(`layout of ${path}`, async ({ page }) => {
    await page.goto(path);
    await ready(page);
    await expectClean(page, path);
    expect(await axeFaults(page), `accessibility on ${path}`).toEqual([]);
    await checkMenu(page, path);
  });
}

test("layout of the planner with a trip", async ({ page }) => {
  await mockTrip(page);
  await page.goto(TRIP);
  await expect(page.getByRole("list", { name: "Route options" }).getByRole("button")).toHaveCount(
    2,
  );
  await expectClean(page, "the planner with a trip");
  expect(await axeFaults(page), "accessibility on the planner with a trip").toEqual([]);
  await checkMenu(page, "the planner with a trip");
});

// The planner and Near me pick their layout in code, so the server must draw the one that fits the
// screen (src/lib/viewport.ts), or laptops see the phone layout first and the page jumps. With
// scripts off, the page stays exactly as the server drew it.
for (const { path, sheet } of [
  { path: TRIP, sheet: "Routes and places" },
  { path: "/nearby", sheet: "Places near you" },
]) {
  test(`${path.split("?")[0]} is drawn in the screen's layout before its scripts run`, async ({
    browser,
  }, testInfo) => {
    const phone = testInfo.project.name === "mobile";
    const context = await browser.newContext({ ...testInfo.project.use, javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(path);
    // The phone's bottom sheet is in the phone layout only.
    await expect(page.locator(`section[aria-label="${sheet}"]`)).toHaveCount(phone ? 1 : 0);
    await context.close();
  });
}

test("a browser's own layout, once known, wins over its device type", async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "one check is enough");
  // A laptop's browser that told us last time it is narrow (a small window): the phone layout.
  const context = await browser.newContext({ ...testInfo.project.use, javaScriptEnabled: false });
  await context.addCookies([{ name: "vp", value: "coarse", url: testInfo.project.use.baseURL! }]);
  const page = await context.newPage();
  await page.goto("/nearby");
  await expect(page.locator('section[aria-label="Places near you"]')).toHaveCount(1);
  await context.close();
});
