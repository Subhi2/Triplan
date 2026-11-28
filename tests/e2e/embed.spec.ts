import { expect, test } from "@playwright/test";
import { config } from "dotenv";

// Embeds (G12): a famous ride as a card any site may frame; the rest of the site stays unframable.

config({ path: ".env.local", quiet: true });
test.skip(!process.env.DATABASE_URL, "needs a seeded database (DATABASE_URL)");

test("a ride's embed shows its card and may be framed by any site", async ({ page }) => {
  test.slow();
  const res = await page.goto("/embed/ride/pollachi-to-valparai");
  expect(res!.headers()["x-frame-options"]).toBeUndefined();
  expect(res!.headers()["content-security-policy"]).toBe("frame-ancestors *");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Valparai");
  await expect(page.getByRole("link", { name: /Plan it in/ })).toHaveAttribute("target", "_blank");
  await expect(page.getByText(/hairpins/)).toBeVisible();

  const other = await page.request.get("/rides/pollachi-to-valparai");
  expect(other.headers()["x-frame-options"]).toBe("SAMEORIGIN");
});
