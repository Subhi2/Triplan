import { expect, test, type Browser, type Page } from "@playwright/test";
import { config } from "dotenv";
import postgres from "postgres";

// Clubs and hosted group rides (G6). Each rider is a separate browser with its own test account
// (NEXT_PUBLIC_COMMUNITY_AUTH=local: a signed cookie, never a Supabase user). These write to the
// real database, so every row is named uniquely and deleted afterwards.

config({ path: ".env.local", quiet: true });
test.skip(!process.env.DATABASE_URL, "needs a database (DATABASE_URL)");

function db() {
  return postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
}

/** A saved trip to host rides on: Bengaluru → Kalasa as a straight-ish line. */
async function makeTrip(sql: postgres.Sql, title: string): Promise<string> {
  const line = JSON.stringify({
    type: "LineString",
    coordinates: [
      [77.5946, 12.9716],
      [76.0962, 13.0033],
      [75.7383, 13.2387],
    ],
  });
  const [trip] = await sql<{ id: string }[]>`
    INSERT INTO trip (title, vehicle, corridor_m, route_geom, distance_m, duration_s, is_public)
    VALUES (${title}, 'bike', 5000, ST_SetSRID(ST_GeomFromGeoJSON(${line}), 4326)::geography,
            330000, 23400, true)
    RETURNING id`;
  await sql`
    INSERT INTO trip_stop (trip_id, position, label, location) VALUES
      (${trip!.id}, 0, 'Bengaluru', ST_SetSRID(ST_MakePoint(77.5946, 12.9716), 4326)::geography),
      (${trip!.id}, 1, 'Kalasa', ST_SetSRID(ST_MakePoint(75.7383, 13.2387), 4326)::geography)`;
  return trip!.id;
}

async function rider(browser: Browser): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  // Leaving, removing and deleting ask first.
  page.on("dialog", (d) => void d.accept());
  return page;
}

async function pickNickname(page: Page, name: string) {
  await page.getByLabel(/Your nickname/).fill(name);
  await page.getByRole("button", { name: "Continue" }).click();
}

test("host a ride, let a rider in, waitlist the next, and move them up when a seat frees", async ({
  browser,
}, testInfo) => {
  test.slow(); // three riders, and the dev server compiles each page on first use
  const tag = `E2E ${testInfo.project.name.slice(0, 3)} ${Date.now() % 1e9}`;
  const sql = db();
  const tripId = await makeTrip(sql, `${tag} trip`);
  try {
    // The host puts up a one-seat ride that needs approval.
    const host = await rider(browser);
    await host.goto(`/group-rides/new?trip=${tripId}`);
    await pickNickname(host, `${tag} host`);
    const form = host.getByRole("form", { name: "Host a group ride" });
    await form.getByLabel("Ride name").fill(`${tag} Kalasa run`);
    await form.getByLabel(/Exact meeting point/).fill("Shell pump after the toll");
    await form.getByLabel(/Seats for riders/).fill("1");
    await form.getByRole("button", { name: "Put the ride up" }).click();
    await host.waitForURL(/\/group-rides\/[0-9a-f-]{36}$/);
    const rideUrl = host.url();
    await expect(host.getByRole("heading", { name: `${tag} Kalasa run` })).toBeVisible();
    await expect(host.getByText("You're hosting this ride.")).toBeVisible();

    // A rider asks to join and does not see the meeting point yet.
    const asha = await rider(browser);
    await asha.goto(rideUrl);
    await asha.getByRole("button", { name: "Ask to join" }).click();
    await pickNickname(asha, `${tag} Asha`);
    await asha.getByLabel(/A note for the host/).fill("Classic 350");
    await asha.getByRole("button", { name: "Send" }).click();
    await expect(asha.getByText("You asked to join. The host will decide.")).toBeVisible();
    await expect(asha.getByText("Shell pump after the toll")).toHaveCount(0);

    // The host lets her in.
    await host.reload();
    const request = host.locator(`[data-rider="${tag} Asha"]`);
    await expect(request).toContainText("Classic 350");
    await request.getByRole("button", { name: "Let in" }).click();
    await expect(
      host
        .getByRole("region", { name: "For riders on this ride" })
        .locator(`[data-rider="${tag} Asha"]`),
    ).toBeVisible();

    // Now she has the meeting point and the ride-together room.
    await asha.reload();
    await expect(asha.getByText("You're in.")).toBeVisible();
    await expect(asha.getByText("Shell pump after the toll")).toBeVisible();
    await expect(asha.getByRole("link", { name: "Ride together on the day" })).toHaveAttribute(
      "href",
      /^\/ride\/[A-Za-z0-9_-]{22}/,
    );

    // The ride is full: the next rider goes on the waitlist.
    const ravi = await rider(browser);
    await ravi.goto(rideUrl);
    await ravi.getByRole("button", { name: "Join the waitlist" }).click();
    await pickNickname(ravi, `${tag} Ravi`);
    await ravi.getByRole("button", { name: "Send" }).click();
    await expect(ravi.getByText("Request sent. The host will decide.")).toBeVisible();
    await host.reload();
    await host
      .locator(`[data-rider="${tag} Ravi"]`)
      .getByRole("button", { name: "Waitlist" })
      .click();
    await expect(host.locator(`[data-rider="${tag} Ravi"][data-status="waitlist"]`)).toBeVisible();

    // The host opens the ride; when Asha leaves, Ravi moves up on his own.
    await host.getByRole("button", { name: "Open until full" }).click();
    await host.getByRole("button", { name: "Save" }).click();
    await asha.reload();
    await asha.getByRole("button", { name: "Leave the ride" }).click();
    // Ravi takes her seat, so the ride is full again.
    await expect(asha.getByRole("button", { name: "Join the waitlist" })).toBeVisible();
    await ravi.reload();
    await expect(ravi.getByText("You're in.")).toBeVisible();
    await expect(ravi.getByText("Shell pump after the toll")).toBeVisible();

    // The decision shows as a badge on "Me" until he opens it.
    await ravi.goto("/group-rides");
    await expect(ravi.getByRole("link", { name: /^Me/ }).locator("[data-updates]")).toBeVisible();
    await ravi.getByRole("link", { name: /^Me/ }).click();
    await expect(
      ravi.locator(`[data-group-ride]`).filter({ hasText: `${tag} Kalasa run` }),
    ).toBeVisible();
    await ravi.goto("/group-rides");
    await expect(ravi.getByRole("link", { name: /^Me/ })).toBeVisible();
    await expect(ravi.locator("[data-updates]")).toHaveCount(0);
  } finally {
    await sql`DELETE FROM group_ride WHERE trip_id = ${tripId}`;
    await sql`DELETE FROM trip WHERE id = ${tripId}`;
    await sql`DELETE FROM rider WHERE nickname LIKE ${`${tag}%`}`;
    await sql.end();
  }
});

test("start a club, ask to join, get approved, and see the members-only link", async ({
  browser,
}, testInfo) => {
  test.slow();
  const tag = `E2E ${testInfo.project.name.slice(0, 3)} ${Date.now() % 1e9}`;
  const sql = db();
  try {
    const owner = await rider(browser);
    await owner.goto("/clubs/new");
    await pickNickname(owner, `${tag} owner`);
    const form = owner.getByRole("form", { name: "Start a club" });
    await form.getByLabel("Club name").fill(`${tag} Riders`);
    await form.getByLabel("Rides from").fill("Hassan");
    await form.getByLabel(/WhatsApp group link/).fill("https://chat.whatsapp.com/E2eTestGroup1234");
    await form.getByRole("button", { name: "Start the club" }).click();
    await owner.waitForURL(
      (url) => /^\/clubs\/[a-z0-9-]+$/.test(url.pathname) && !url.pathname.endsWith("/new"),
    );
    const clubUrl = owner.url();
    await expect(owner.getByText("You're the club's owner.")).toBeVisible();

    // Someone else asks; the link stays hidden from them until they are in.
    const meera = await rider(browser);
    await meera.goto(clubUrl);
    await meera.getByRole("button", { name: "Ask to join" }).click();
    // With a nickname picked, the request form opens straight away.
    await pickNickname(meera, `${tag} Meera`);
    await meera.getByRole("button", { name: "Send request" }).click();
    await expect(meera.getByText("You asked to join.")).toBeVisible();
    await expect(meera.getByRole("link", { name: /WhatsApp group/ })).toHaveCount(0);

    await owner.reload();
    await owner
      .locator(`[data-member="${tag} Meera"]`)
      .getByRole("button", { name: "Approve" })
      .click();
    await expect(
      owner.getByRole("region", { name: "Members" }).locator(`[data-member="${tag} Meera"]`),
    ).toBeVisible();

    await meera.reload();
    await expect(meera.getByText("You're a member.")).toBeVisible();
    await expect(meera.getByRole("link", { name: /WhatsApp group/ })).toHaveAttribute(
      "href",
      "https://chat.whatsapp.com/E2eTestGroup1234",
    );
  } finally {
    await sql`DELETE FROM club WHERE name = ${`${tag} Riders`}`;
    await sql`DELETE FROM rider WHERE nickname LIKE ${`${tag}%`}`;
    await sql.end();
  }
});
