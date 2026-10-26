import { expect, test, type Page, type Request } from "@playwright/test";

// Ride together (docs/02): rooms talk between tabs through the local test transport
// (NEXT_PUBLIC_RIDE_TRANSPORT=local in playwright.config.ts), never through Supabase.

const ROOM = "AbCdEfGhIjKlMnOpQrStUv";
const SAKLESHPUR = { longitude: 75.785, latitude: 12.943 };

test.use({ geolocation: SAKLESHPUR, permissions: ["geolocation"] });

async function blankMap(page: Page) {
  await page.route("https://tiles.openfreemap.org/**", (route) =>
    route.fulfill({
      json: { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: {} }] },
    }),
  );
}

async function join(page: Page, name: string, query = "") {
  await blankMap(page);
  await page.goto(`/ride/${ROOM}${query}`);
  // Wait for the page to run (a person waits for it too), then type over any saved nickname.
  await page.locator("form[data-ready]").waitFor();
  await page.getByRole("textbox", { name: "Your name in the group" }).fill(name);
  await page.getByRole("button", { name: "Join" }).click();
}

const riders = (page: Page) => page.getByRole("list", { name: "Riders" });

test("riders see each other, a regroup pin, and the position never reaches our server", async ({
  page,
  context,
}) => {
  const requests: Request[] = [];
  context.on("request", (r) => requests.push(r));

  await join(page, "Asha", "?title=Bengaluru%20%E2%86%92%20Kalasa");
  await expect(page.getByRole("heading", { name: "Ride together" })).toBeVisible();
  await expect(riders(page)).toContainText("Asha (you)");

  const bala = await context.newPage();
  await join(bala, "Bala");
  await expect(riders(bala)).toContainText("Asha");
  await expect(riders(page)).toContainText("Bala");
  // Nothing is shared before the tap.
  await expect(riders(bala).getByRole("listitem").filter({ hasText: "Asha" })).toContainText(
    "not sharing",
  );

  await page.getByRole("button", { name: "Share my position" }).click();
  await expect(page.getByText("Sharing every 10 seconds with the group only")).toBeVisible();
  await expect(riders(bala).getByRole("listitem").filter({ hasText: "Asha" })).toContainText(
    "just now",
  );
  await expect(bala.locator('[data-rider="Asha"]')).toBeVisible();

  // A regroup pin: tap the button, then the map.
  await page.getByRole("button", { name: "Drop a regroup pin" }).click();
  await page.getByRole("region", { name: "Map" }).click({ position: { x: 120, y: 120 } });
  await expect(bala.getByText("pin from Asha")).toBeVisible();
  await expect(bala.locator("[data-regroup]")).toBeVisible();

  // Family follows without being listed or sharing.
  const home = await context.newPage();
  await blankMap(home);
  await home.goto(`/ride/${ROOM}?follow=1`);
  await expect(home.getByText("You are following the group")).toBeVisible();
  await expect(riders(home)).toContainText("Asha");
  await expect(riders(home)).toContainText("Bala");
  await expect(page.getByText("1 following from home")).toBeVisible();
  await expect(riders(page)).not.toContainText("Family");

  // Stop sharing: the others see the position go.
  await page.getByRole("button", { name: "Stop sharing" }).click();
  await expect(riders(bala).getByRole("listitem").filter({ hasText: "Asha" })).toContainText(
    "not sharing",
  );
  await expect(bala.locator('[data-rider="Asha"]')).toHaveCount(0);

  // No request to our server carried the position (75.785, 12.943).
  const ours = requests.filter((r) => r.url().startsWith(new URL(page.url()).origin));
  for (const r of ours) {
    const sent = `${r.url()} ${r.postData() ?? ""}`;
    expect(sent).not.toContain("75.78");
    expect(sent).not.toContain("12.94");
  }
});

test("an unknown room address is a 404", async ({ page }) => {
  const res = await page.goto("/ride/not-a-room");
  expect(res?.status()).toBe(404);
});
