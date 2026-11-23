import type { FullConfig } from "@playwright/test";

// The dev server compiles each route on its first request. A compile that lands while a test is
// navigating triggers the browser's hot reload, which can drop that navigation (the Near me
// "Ride there" test failed this way when the Menu's updates count first compiled its route).
// Asking for the pages and the per-page API routes once, before any test, keeps compiles out of
// the tests.
const ROUTES = [
  "/",
  "/nearby",
  "/rides",
  "/trips",
  "/about",
  "/bucket-list",
  "/clubs",
  "/clubs/new",
  "/group-rides",
  "/group-rides/new",
  "/me",
  "/api/me/updates",
  "/api/pow",
  // Routes with an id: a made-up id still compiles the route (it answers 404 or 405).
  ...[
    "/clubs/:slug",
    "/group-rides/:id",
    "/rides/:slug",
    "/place/:slug",
    "/trips/:id",
    "/ride/:room",
    "/api/me",
    "/api/usage",
    "/api/clubs",
    "/api/clubs/:slug",
    "/api/clubs/:slug/members",
    "/api/clubs/:slug/members/:id",
    "/api/group-rides",
    "/api/group-rides/:id",
    "/api/group-rides/:id/requests",
    "/api/group-rides/:id/requests/:id",
    "/api/trips",
    "/api/trips/:id",
  ].map((r) =>
    r
      .replace(/:slug/g, "e2e-warm-up")
      .replace(/:room/g, "e2eWarmUpRoom000000000a")
      .replace(/:id/g, "00000000-0000-4000-8000-000000000000"),
  ),
];

export default async function globalSetup(config: FullConfig) {
  const base = config.projects[0]?.use.baseURL;
  if (!base) return;
  // The web server is up before global setup runs; this only guards a slow first answer.
  for (let tries = 0; tries < 60; tries++) {
    if (
      await fetch(base).then(
        (r) => r.ok,
        () => false,
      )
    )
      break;
    await new Promise((r) => setTimeout(r, 2_000));
  }
  for (const route of ROUTES) {
    await fetch(new URL(route, base)).catch(() => undefined);
  }
}
