import { config } from "dotenv";
import { expect, test, type Page } from "@playwright/test";
import type { RouteOption } from "@/lib/trip";
import { routeFixture, type RouteFixture } from "../helpers/fixtures";

// Product spec acceptance criteria 1–4 (docs/01-product-spec.md). Routing is mocked with recorded
// OSRM geometry; places come from the real seeded database, so this needs DATABASE_URL.
config({ path: ".env.local", quiet: true });
test.skip(!process.env.DATABASE_URL, "needs a seeded database (DATABASE_URL)");

const B = "Bengaluru@77.5946,12.9716";
const K = "Kalasa@75.356,13.234";
const SAKLESHPUR_TRIP = `/?from=${B}&to=${K}`;
const CHIKKAMAGALURU_TRIP = `/?from=${B}&via=Belur@75.865,13.165&via=Chikkamagaluru@75.772,13.3161&via=Balehonnur@75.46,13.36&to=${K}`;

function options(fixture: RouteFixture, labels: string[]): RouteOption[] {
  return routeFixture(fixture, "bike").map((r, i) => ({
    id: `${fixture}-${i}`, // not a cache id, so the client sends the geometry
    geometry: r.geometry,
    distanceKm: r.distanceM / 1000,
    durationMin: Math.round(r.durationS / 60),
    viaLabel: labels[i]!,
    towns: [],
  }));
}

async function mockRouting(page: Page) {
  await page.route("**/api/route", (route) => {
    const { stops } = route.request().postDataJSON() as { stops: unknown[] };
    const routes =
      stops.length === 2
        ? options("bengaluru-kalasa", ["via Chikkamagaluru", "via Hassan, Sakleshpur"])
        : options("bengaluru-belur-chikkamagaluru-balehonnur-kalasa", [
            "via Belur, Chikkamagaluru +1",
          ]);
    return route.fulfill({ json: { routes } });
  });
  await page.route("https://tiles.openfreemap.org/**", (route) =>
    route.fulfill({
      json: { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: {} }] },
    }),
  );
}

/** Rows of the place list: km marker, name, detour label (as km, 0 on route) and category. */
async function placeRows(page: Page) {
  const rows = page.getByRole("list", { name: "Places along the route" }).getByRole("button");
  await expect(rows.first()).toBeVisible({ timeout: 30_000 });
  const texts = await rows.allInnerTexts();
  return texts.map((t) => {
    const [km, name, detour, category] = t.split("\n").map((s) => s.trim());
    const detourKm = detour === "On route" ? 0 : Number(/\+([\d.]+) km/.exec(detour!)?.[1]);
    return { km: Number(km!.replace(" km", "")), name: name!, detour: detour!, detourKm, category };
  });
}

async function setCorridor(page: Page, km: string) {
  const list = page.getByRole("list", { name: "Places along the route" });
  const before = await list.innerText();
  if (await page.getByRole("button", { name: "Edit trip" }).isVisible()) {
    await page.getByRole("button", { name: "Edit trip" }).click();
  }
  await page.getByLabel("Places within").selectOption(km);
  await expect(list).not.toHaveText(before, { timeout: 30_000 });
}

test.beforeEach(async ({ page }) => mockRouting(page));

test("the Sakleshpur route lists Manjarabad Fort and Ballalarayana Durga, ordered by km", async ({
  page,
}) => {
  await page.goto(SAKLESHPUR_TRIP);
  const cards = page.getByRole("list", { name: "Route options" }).getByRole("button");
  await expect(cards).toHaveCount(2); // criterion 1: at least two routes
  await cards.filter({ hasText: "via Hassan, Sakleshpur" }).click();

  const rows = await placeRows(page);
  const names = rows.map((r) => r.name);
  expect(names).toEqual(expect.arrayContaining(["Manjarabad Fort", "Ballalarayana Durga"]));
  for (const other of ["Chennakeshava Temple, Belur", "Mullayanagiri Peak"]) {
    expect(names).not.toContain(other);
  }
  for (const detour of ["Devaramane Viewpoint", "Shravanabelagola (Gommateshwara)"]) {
    expect(names).not.toContain(detour);
  }
  expect(rows.find((r) => r.name === "Manjarabad Fort")!.detourKm).toBeCloseTo(1.6, 0);
  const kms = rows.map((r) => r.km);
  expect(kms).toEqual([...kms].sort((a, b) => a - b));

  // Real detours appear only with a wider corridor, flagged as detours.
  await setCorridor(page, "10");
  const wide = await placeRows(page);
  for (const detour of ["Devaramane Viewpoint", "Shravanabelagola (Gommateshwara)"]) {
    const row = wide.find((r) => r.name === detour);
    expect(row, detour).toBeDefined();
    expect(row!.detourKm).toBeGreaterThan(5); // flagged: beyond the default corridor
  }
});

test("the Chikkamagaluru route lists Belur, and Mullayanagiri only as a 10 km detour", async ({
  page,
}) => {
  await page.goto(CHIKKAMAGALURU_TRIP);
  const names = (await placeRows(page)).map((r) => r.name);
  expect(names).toContain("Chennakeshava Temple, Belur");
  for (const other of ["Manjarabad Fort", "Ballalarayana Durga", "Mullayanagiri Peak"]) {
    expect(names).not.toContain(other);
  }

  await setCorridor(page, "10");
  const wide = await placeRows(page);
  const peak = wide.find((r) => r.name === "Mullayanagiri Peak");
  expect(peak).toBeDefined();
  expect(peak!.detourKm).toBeGreaterThan(9);
});

test("category chips and the detour toggle filter the list", async ({ page }) => {
  await page.goto(SAKLESHPUR_TRIP);
  await page
    .getByRole("list", { name: "Route options" })
    .getByRole("button")
    .filter({ hasText: "via Hassan, Sakleshpur" })
    .click();
  await placeRows(page);

  await page.getByRole("button", { name: /^Temple/ }).click();
  const temples = await placeRows(page);
  expect(temples.every((r) => r.category === "Temple")).toBe(true);
  expect(temples.map((r) => r.name)).toEqual(
    expect.arrayContaining([
      "Hasanamba Temple",
      "Kalaseshwara Temple, Kalasa",
      "Horanadu Annapoorneshwari Temple",
    ]),
  );

  await page.getByLabel("Hide detours over").check();
  await page.getByLabel("Maximum detour").selectOption("1");
  const close = await placeRows(page);
  expect(close.every((r) => r.category === "Temple" && r.detourKm <= 1)).toBe(true);
  expect(close.map((r) => r.name)).toContain("Kalaseshwara Temple, Kalasa");
  expect(close.map((r) => r.name)).not.toContain("Horanadu Annapoorneshwari Temple"); // +4.9 km
  expect(decodeURIComponent(page.url())).toContain("cat=temple&hd=1");
});
