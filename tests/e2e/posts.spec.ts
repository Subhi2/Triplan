import { solveChallenge } from "altcha-lib";
import { deriveKey } from "altcha-lib/algorithms/pbkdf2";
import { expect, test } from "@playwright/test";
import { config } from "dotenv";
import postgres from "postgres";
import sharp from "sharp";

// Riders' reviews, photos and road reports without sign-in (G5 step 14). These write to the real
// database, so each test names its rows uniquely and deletes them afterwards. The server runs with
// a test proof-of-work key and keeps photos in memory (playwright.config.ts).

config({ path: ".env.local", quiet: true });
test.skip(!process.env.DATABASE_URL, "needs a seeded database (DATABASE_URL)");

const PLACE = "/place/manjarabad-fort";

function db() {
  return postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
}

test("a review needs no sign-in, waits for a check, and only this phone can delete it", async ({
  page,
}, testInfo) => {
  test.slow(); // the dev server compiles the place page and the review API on first use
  const name = `E2E ${testInfo.project.name.slice(0, 3)} ${Date.now() % 1e9}`;
  const sql = db();
  try {
    await page.goto(PLACE);
    await page.getByRole("button", { name: "Write a review" }).click();
    const form = page.getByRole("form", { name: /Review of Manjarabad Fort/ });
    await form.getByRole("button", { name: "Send review" }).click();
    await expect(page.getByText("Pick 1 to 5 stars.")).toBeVisible();

    // A tap on the fourth star (its label); screen readers hear "4 stars".
    await form.locator("label").filter({ hasText: "4 stars" }).click();
    await expect(form.getByRole("radio", { name: "4 stars" })).toBeChecked();
    await form.getByLabel("What should riders know?").fill("Steep steps, carry water.");
    await form.getByLabel("Visited in").selectOption("7");
    await form.getByLabel("Came by").selectOption("bike");
    await form.getByLabel("Your name").fill(name);
    await form.getByRole("button", { name: "Send review" }).click();
    await expect(page.getByText(/Your review shows here once it has been checked/)).toBeVisible({
      timeout: 30_000,
    });

    const [row] = await sql`SELECT status, rating, body, device_hash, user_id FROM review
                            WHERE nickname = ${name}`;
    expect(row).toMatchObject({ status: "unverified", rating: 4, user_id: null });
    expect(row!.device_hash).toMatch(/^[0-9a-f]{64}$/);
    // Not on the page until an admin approves it.
    await page.reload();
    await expect(page.getByText("Steep steps, carry water.")).toHaveCount(0);

    await page.getByRole("button", { name: "Delete my review" }).click();
    await expect(page.getByText("Your review is deleted.")).toBeVisible();
    expect(await sql`SELECT 1 FROM review WHERE nickname = ${name}`).toHaveLength(0);
  } finally {
    await sql`DELETE FROM review WHERE nickname = ${name}`;
    await sql.end();
  }
});

test("a photo is resized and queued, credited to the name given", async ({ page }, testInfo) => {
  test.slow();
  const name = `E2E ${testInfo.project.name.slice(0, 3)} ${Date.now() % 1e9}`;
  const photo = await sharp({
    create: { width: 1200, height: 800, channels: 3, background: { r: 40, g: 90, b: 60 } },
  })
    .jpeg()
    .withMetadata({ exif: { IFD0: { Model: "Rider X" } } })
    .toBuffer();
  const sql = db();
  try {
    await page.goto(PLACE);
    await page.getByRole("button", { name: "Add a photo" }).click();
    const form = page.getByRole("form", { name: /Photo of Manjarabad Fort/ });
    await form
      .getByLabel(/^Photo/)
      .setInputFiles({ name: "fort.jpg", mimeType: "image/jpeg", buffer: photo });
    await form.getByLabel("Credit it to").fill(name);
    await form.getByRole("button", { name: "Send photo" }).click();
    await expect(page.getByText("Tick the box to say you took it.")).toBeVisible();
    await form.getByRole("checkbox").check();
    await form.getByRole("button", { name: "Send photo" }).click();
    await expect(
      page.getByText("Thanks. Your photo shows here once it has been checked."),
    ).toBeVisible({ timeout: 30_000 });
    const [row] = await sql`SELECT status, source, license, width, height, url FROM media
                            WHERE author = ${name}`;
    expect(row).toMatchObject({
      status: "unverified",
      source: "user",
      license: "user-granted",
      width: 1200,
      height: 800,
    });
    expect(row!.url).toMatch(/^https:\/\/photos\.test\/.+\.webp$/);
  } finally {
    await sql`DELETE FROM media WHERE author = ${name} AND source = 'user'`;
    await sql.end();
  }
});

test("a road report shows on the route only once approved, and goes when it expires", async ({
  request,
}, testInfo) => {
  test.slow();
  const name = `E2E ${testInfo.project.name.slice(0, 3)} ${Date.now() % 1e9}`;
  const line = {
    type: "LineString",
    coordinates: [
      [75.7, 13.0],
      [75.8, 13.0],
    ],
  };
  const sql = db();
  const solved = async () => {
    const challenge = await (await request.get("/api/pow")).json();
    return { challenge, solution: await solveChallenge({ challenge, deriveKey }) };
  };
  const reports = async () =>
    (
      (await (await request.post("/api/route/reports", { data: { geometry: line } })).json()) as {
        reports: { nickname: string }[];
      }
    ).reports.filter((r) => r.nickname === name);
  try {
    const report = { kind: "landslide", location: [75.75, 13.0005], note: "Test", nickname: name };
    const deviceKey = "B".repeat(43);
    const pow = await solved();
    const res = await request.post("/api/road-reports", { data: { report, pow, deviceKey } });
    expect(res.status()).toBe(201);
    // The same proof of work cannot pay for a second post.
    const again = await request.post("/api/road-reports", { data: { report, pow, deviceKey } });
    expect(again.status()).toBe(403);
    // Without any proof the post is refused.
    expect(
      (await request.post("/api/road-reports", { data: { report, deviceKey } })).status(),
    ).toBe(400);

    expect(await reports()).toHaveLength(0);
    // What an admin's Approve does.
    await sql`UPDATE road_report SET status = 'verified' WHERE nickname = ${name}`;
    expect(await reports()).toHaveLength(1);
    await sql`UPDATE road_report SET expires_at = now() - interval '1 minute' WHERE nickname = ${name}`;
    expect(await reports()).toHaveLength(0);
  } finally {
    await sql`DELETE FROM road_report WHERE nickname = ${name}`;
    await sql.end();
  }
});

test("the admin page lets nobody in when no admin is set", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Admin" })).toBeVisible();
  await expect(page.getByText("No admin is set up")).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0);
});
