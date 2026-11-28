import { expect, test } from "@playwright/test";
import { config } from "dotenv";
import postgres from "postgres";
import { axeFaults } from "../helpers/axe";
import { routeFixture } from "../helpers/fixtures";
import { layoutFaults } from "../helpers/layoutAudit";

// The road book (G10): the trip on paper from its route id. The route is put in route_cache as
// the planner would (a recorded OSRM answer), then removed.

config({ path: ".env.local", quiet: true });
test.skip(!process.env.DATABASE_URL, "needs a seeded database (DATABASE_URL)");

const TRIP = "from=Bengaluru@77.5946,12.9716&to=Kalasa@75.356,13.234&v=bike&c=5";

test("the road book lists the stops, fuel, rules and helplines, ready to print", async ({
  page,
}, testInfo) => {
  test.slow(); // compiles the page and queries the corridor
  // Each project its own row, so one test's clean-up never takes another's route.
  const HASH = (testInfo.project.name === "mobile" ? "e2e0b00c1" : "e2e0b00c2").padEnd(32, "0");
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
  try {
    const routes = routeFixture("bengaluru-kalasa", "bike");
    await sql`INSERT INTO route_cache (key, response)
              VALUES (${`route:v2:${HASH}`}, ${sql.json(JSON.parse(JSON.stringify(routes)))})
              ON CONFLICT (key) DO UPDATE SET response = excluded.response, created_at = now()`;
    await page.goto(`/book?${TRIP}&route=${HASH}-1`);
    await expect(page.getByRole("heading", { name: "Bengaluru → Kalasa", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Worth stopping for" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Fuel" })).toBeVisible();
    await expect(page.getByText("112")).toBeVisible();
    await expect(page.getByRole("button", { name: "Print or save as PDF" })).toBeVisible();
    await expect(page.locator("svg").first()).toBeVisible();
    expect(await layoutFaults(page)).toMatchObject({ overflowX: 0, cut: [], small: [] });
    expect(await axeFaults(page)).toEqual([]);
  } finally {
    await sql`DELETE FROM route_cache WHERE key = ${`route:v2:${HASH}`}`;
    await sql.end();
  }
});

test("a road book whose route is gone says so and links back", async ({ page }) => {
  await page.goto(`/book?${TRIP}&route=${"f".repeat(32)}-0`);
  await expect(page.getByText(/no longer kept/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Open the trip" })).toHaveAttribute(
    "href",
    /from=Bengaluru/,
  );
});
