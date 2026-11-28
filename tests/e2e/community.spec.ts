import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { config } from "dotenv";
import postgres from "postgres";
import type { LineString } from "geojson";
import { routeCurvature } from "@/lib/curvature";
import type { RouteOption } from "@/lib/trip";
import { roadMix } from "@/server/services/roadMix";
import { routeFixture } from "../helpers/fixtures";

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

/** The ride page's ride check (G6): its road and checks answered here, never OSRM or SACHET. */
async function mockRideCheck(context: BrowserContext) {
  const routes: RouteOption[] = routeFixture("bengaluru-kalasa", "bike").map((r, i) => ({
    id: `community-${i}`,
    geometry: r.geometry,
    distanceKm: r.distanceM / 1000,
    durationMin: Math.round(r.durationS / 60),
    viaLabel: `route ${i + 1}`,
    towns: [],
    roadMix: roadMix(r),
    curvature: routeCurvature(r.geometry),
  }));
  await context.route("**/api/route", (route) => route.fulfill({ json: { routes } }));
  await context.route("**/api/route/alerts", (route) =>
    route.fulfill({ json: { alerts: [], partial: false } }),
  );
  await context.route("**/api/route/rules", (route) =>
    route.fulfill({ json: { rules: [], timeline: null } }),
  );
  await context.route("**/api/places/along", (route) => route.fulfill({ json: { places: [] } }));
  await context.route("**/api/weather", (route) => route.fulfill({ json: { points: [] } }));
}

/** The rest of the planner answered here: no terrain tiles, safety stops, day split or map. */
async function mockPlanner(page: Page) {
  await page.route("**/api/route/profile", (route) => route.fulfill({ json: { profile: null } }));
  await page.route("**/api/route/reports", (route) => route.fulfill({ json: { reports: [] } }));
  for (const api of ["**/api/services/along", "**/api/route/days"])
    await page.route(api, (route) => route.fulfill({ status: 503, json: { error: "Not here" } }));
  await page.route("https://tiles.openfreemap.org/**", (route) =>
    route.fulfill({
      json: { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: {} }] },
    }),
  );
}

async function rider(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  await mockRideCheck(context);
  const page = await context.newPage();
  // Leaving, removing and deleting ask first.
  page.on("dialog", (d) => void d.accept());
  return page;
}

/**
 * A join request solves a proof of work in the browser before it is sent (about a second, much
 * longer while the dev server compiles the route), so its answer gets the posts' longer wait.
 */
const POW_WAIT = { timeout: 30_000 };

/** A ride's or club's first page: its scripts compile on first use in the dev server. */
const FIRST_LOAD = { timeout: 30_000 };

/** On phones "Me" is behind the Menu, whose button carries the same count: open it first. */
async function showMe(page: Page) {
  const menu = page
    .getByRole("navigation", { name: "Main" })
    .getByRole("button", { name: /^Menu/ });
  if (await menu.isVisible()) await menu.click();
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
    await expect(host.getByText("You're hosting this ride.")).toBeVisible(FIRST_LOAD);
    // The ride check, for the ride's own start time rather than one the rider picks.
    // Laptops open it by themselves; phones fold it until tapped.
    const start = host.getByText(/\(the ride's start\)$/);
    await expect(async () => {
      if (!(await start.isVisible()))
        await host.getByRole("button", { name: /^Ride check/ }).click();
      await expect(start).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 10_000 });

    // A rider asks to join and does not see the meeting point yet.
    const asha = await rider(browser);
    await asha.goto(rideUrl);
    await asha.getByRole("button", { name: "Ask to join" }).click();
    await pickNickname(asha, `${tag} Asha`);
    await asha.getByLabel(/A note for the host/).fill("Classic 350");
    await asha.getByRole("button", { name: "Send" }).click();
    await expect(asha.getByText("You asked to join. The host will decide.")).toBeVisible(POW_WAIT);
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
    await expect(ravi.getByText("Request sent. The host will decide.")).toBeVisible(POW_WAIT);
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
    const menu = ravi
      .getByRole("navigation", { name: "Main" })
      .getByRole("button", { name: /^Menu/ });
    if (await menu.isVisible()) {
      await expect(menu.locator("[data-updates]")).toBeVisible();
    }
    await showMe(ravi);
    await expect(ravi.getByRole("link", { name: /^Me/ }).locator("[data-updates]")).toBeVisible();
    await ravi.getByRole("link", { name: /^Me/ }).click();
    await expect(
      ravi.locator(`[data-group-ride]`).filter({ hasText: `${tag} Kalasa run` }),
    ).toBeVisible();
    await ravi.goto("/group-rides");
    await showMe(ravi);
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
    await expect(owner.getByText("You're the club's owner.")).toBeVisible(FIRST_LOAD);

    // Someone else asks; the link stays hidden from them until they are in.
    const meera = await rider(browser);
    await meera.goto(clubUrl);
    await meera.getByRole("button", { name: "Ask to join" }).click();
    // With a nickname picked, the request form opens straight away.
    await pickNickname(meera, `${tag} Meera`);
    await meera.getByRole("button", { name: "Send request" }).click();
    await expect(meera.getByText("You asked to join.")).toBeVisible(POW_WAIT);
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

test("an opened GPX that follows a famous ride offers to tick it off the bucket list", async ({
  browser,
}, testInfo) => {
  test.slow();
  const tag = `E2E ${testInfo.project.name.slice(0, 3)} ${Date.now() % 1e9}`;
  const slug = "bengaluru-to-kalasa-via-sakleshpur";
  const sql = db();
  try {
    // The famous ride's own road, as a rider's recording of it would follow.
    const [row] = await sql`SELECT title, ST_AsGeoJSON(route_geom::geometry, 5) AS line
                            FROM ride WHERE slug = ${slug}`;
    test.skip(!row, "the famous rides are not in this database");
    const line = (JSON.parse(row!.line as string) as { coordinates: [number, number][] })
      .coordinates;
    const step = Math.max(1, Math.floor(line.length / 400));
    const track = line.filter((_, i) => i % step === 0);
    const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>Sunday ride</name><trkseg>
${track.map(([lng, lat]) => `    <trkpt lat="${lat}" lon="${lng}"></trkpt>`).join("\n")}
  </trkseg></trk>
</gpx>`;

    const page = await rider(browser);
    const geometry: LineString = { type: "LineString", coordinates: track };
    const uploaded: RouteOption = {
      id: `${"b".repeat(32)}-0`,
      geometry,
      distanceKm: 300,
      durationMin: 400,
      viaLabel: "Sunday ride",
      towns: [],
      roadMix: null,
      curvature: routeCurvature(geometry),
    };
    await page.route("**/api/route/upload**", (route) =>
      route.fulfill({ json: { route: uploaded } }),
    );
    await mockPlanner(page);

    await page.goto("/");
    await page.getByTestId("ride-file").setInputFiles({
      name: "sunday.gpx",
      mimeType: "application/gpx+xml",
      buffer: Buffer.from(gpx),
    });
    const famous = page.getByRole("region", { name: "Famous ride" });
    await expect(famous).toContainText(`You rode ${row!.title as string}`, FIRST_LOAD);

    // Tick it off: a nickname first, then the day it was ridden.
    await famous.getByRole("button", { name: "I've ridden it" }).click();
    await pickNickname(page, `${tag} Rider`);
    await famous.getByRole("button", { name: "Save as done" }).click();
    await expect(famous.getByText("You rode this")).toBeVisible();
    const [mark] = await sql`SELECT m.status FROM ride_mark m JOIN rider r ON r.id = m.rider_id
                             WHERE r.nickname = ${`${tag} Rider`} AND m.ride_slug = ${slug}`;
    expect(mark).toMatchObject({ status: "done" });
  } finally {
    // Removing the rider removes their marks (on delete cascade).
    await sql`DELETE FROM rider WHERE nickname LIKE ${`${tag}%`}`;
    await sql.end();
  }
});

test("a rider's bike follows them to a new trip, kept with their account", async ({
  browser,
}, testInfo) => {
  test.slow();
  const tag = `E2E ${testInfo.project.name.slice(0, 3)} ${Date.now() % 1e9}`;
  const sql = db();
  try {
    const page = await rider(browser);
    await mockPlanner(page);
    // A rider account first (a nickname on this device).
    await page.goto("/me");
    await pickNickname(page, `${tag} Rider`);
    await expect(page.getByText(`Riding as ${tag} Rider`)).toBeVisible(FIRST_LOAD);

    const openCheck = async () => {
      await expect(
        page.getByRole("list", { name: "Route options" }).getByRole("button").first(),
      ).toBeVisible(FIRST_LOAD);
      const toggle = page.getByRole("button", { name: /^Ride check/ });
      if ((await toggle.getAttribute("aria-expanded")) === "false") await toggle.click();
      return page.getByRole("region", { name: "Ride check" });
    };

    await page.goto("/?from=Bengaluru@77.5946,12.9716&to=Kalasa@75.356,13.234&v=bike");
    let check = await openCheck();
    const saved = page.waitForResponse(
      (r) => r.url().endsWith("/api/me/vehicle") && r.request().method() === "PUT",
    );
    await check.getByRole("spinbutton", { name: "Range on a full tank (km)" }).fill("320");
    expect((await saved).ok()).toBe(true);
    const [row] = await sql`SELECT v.range_km FROM rider_vehicle v JOIN rider r ON r.id = v.rider_id
                            WHERE r.nickname = ${`${tag} Rider`} AND v.vehicle = 'bike'`;
    expect(row).toMatchObject({ range_km: 320 });

    // Another trip, with no bike in its link: it starts from the rider's own.
    await page.goto("/?from=Bengaluru@77.5946,12.9716&to=Kalasa@75.356,13.234&v=bike&c=10");
    check = await openCheck();
    await expect(check.getByRole("spinbutton", { name: "Range on a full tank (km)" })).toHaveValue(
      "320",
    );
  } finally {
    // Removing the rider removes their bike (on delete cascade).
    await sql`DELETE FROM rider WHERE nickname LIKE ${`${tag}%`}`;
    await sql.end();
  }
});
