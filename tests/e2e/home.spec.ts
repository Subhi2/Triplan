import { expect, test } from "@playwright/test";

test("home page shows the placeholder planner", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Bike Travelling Guide" })).toBeVisible();
});

test("web app manifest is served", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.ok()).toBe(true);
  const manifest = (await res.json()) as { name: string };
  expect(manifest.name).toBe("Bike Travelling Guide");
});
