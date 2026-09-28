import { defineConfig, devices } from "@playwright/test";

// Own port and build dir, so tests never reuse or disturb a dev server you have running on :3000.
const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
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
    env: { NEXT_DIST_DIR: ".next-e2e" },
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
