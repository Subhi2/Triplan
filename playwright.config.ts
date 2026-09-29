import { defineConfig, devices } from "@playwright/test";

// Own port and build dir, so tests never reuse or disturb a dev server you have running on :3000.
const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  // One dev server compiles routes on demand and shares the database; more workers only time out.
  workers: process.env.CI ? 1 : 2,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    // Product spec requires the app to work at 375 px width.
    {
      name: "mobile",
      use: { ...devices["Desktop Chrome"], viewport: { width: 375, height: 740 } },
    },
  ],
  webServer: {
    command: `pnpm exec next dev --port ${PORT}`,
    // Photon points nowhere, so the app never calls it from tests (suggestions fall back to ours).
    env: { NEXT_DIST_DIR: ".next-e2e", PHOTON_BASE_URL: "http://127.0.0.1:9/api" },
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
