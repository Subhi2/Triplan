import { expect, test } from "@playwright/test";

test("About tells how it works and credits every data source", async ({ page }) => {
  await page.goto("/about");
  await expect(page.getByRole("heading", { name: "About Triplan", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "How it works" })).toBeVisible();
  await expect(page.locator("[data-stats]")).toContainText("places along India's roads");
  await expect(page.locator("[data-stats]")).toContainText("rides planned");
  const sources = page.getByRole("region", { name: "Where the data comes from" });
  for (const name of ["OpenStreetMap", "Wikimedia Commons", "MET Norway", "AWS Terrain Tiles"]) {
    await expect(sources).toContainText(name);
  }
  await expect(page.getByRole("link", { name: "About", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("an unknown address gets a way back", async ({ page }) => {
  const res = await page.goto("/no-such-page");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "This road doesn't go anywhere" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Plan a ride" })).toHaveAttribute("href", "/");
});

test("content pages share the main navigation", async ({ page }) => {
  await page.goto("/trips");
  const nav = page.getByRole("navigation", { name: "Main" });
  for (const name of ["Famous rides", "Near me", "Your trips", "About"]) {
    await expect(nav.getByRole("link", { name })).toBeVisible();
  }
});

test("without an AI key there is no plain-words box", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("region", { name: "Try a famous ride" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Or say it in plain words" })).toHaveCount(0);
  const res = await page.request.post("/api/trip-from-words", { data: { text: "Pune to Kolad" } });
  expect(res.status()).toBe(404);
});
