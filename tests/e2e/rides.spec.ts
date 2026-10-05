import { expect, test } from "@playwright/test";

// Famous rides are read from the ride table (seeded with `pnpm db:seed-rides`); these pages make
// no routing calls, so the tests use the real pages without mocks.

test("the gallery lists the famous rides with their numbers", async ({ page }) => {
  await page.goto("/rides");
  await expect(page.getByRole("heading", { name: "Famous rides", level: 1 })).toBeVisible();
  const cards = page.getByRole("list", { name: "Famous rides" }).getByRole("link");
  expect(await cards.count()).toBeGreaterThanOrEqual(15);
  await expect(page.getByRole("link", { name: /Pollachi to Valparai/ })).toContainText(
    "40 hairpins",
  );
});

test("a ride page shows the route's facts and opens it in the planner", async ({ page }) => {
  await page.goto("/rides/pollachi-to-valparai");
  await expect(page).toHaveTitle(/Pollachi to Valparai/);
  await expect(page.getByRole("heading", { name: "Pollachi to Valparai", level: 1 })).toBeVisible();
  await expect(page.locator("dl").first()).toContainText("Hairpins40");
  await expect(page.getByRole("heading", { name: "Ups and downs" })).toBeVisible();

  const plan = page.getByRole("link", { name: "Plan this ride" });
  const href = decodeURIComponent((await plan.getAttribute("href")) ?? "");
  expect(href).toMatch(/^\/\?from=Pollachi@77\.00873,10\.65882&to=Valparai@76\.95573,10\.32799/);

  const jsonLd = JSON.parse(
    (await page.locator('script[type="application/ld+json"]').textContent()) ?? "{}",
  ) as { "@type": string; itinerary: { numberOfItems: number } };
  expect(jsonLd["@type"]).toBe("TouristTrip");
  expect(jsonLd.itinerary.numberOfItems).toBe(2);
});

test("an unknown ride is a 404", async ({ page }) => {
  const res = await page.goto("/rides/no-such-ride");
  expect(res?.status()).toBe(404);
});

test("the empty planner offers famous rides that open in the planner", async ({ page }) => {
  await page.goto("/");
  const strip = page.getByRole("region", { name: "Try a famous ride" });
  await expect(strip).toBeVisible();
  const first = strip.locator("[data-ride]").first();
  expect(decodeURIComponent((await first.getAttribute("href")) ?? "")).toMatch(/^\/\?from=.+&to=/);
});
