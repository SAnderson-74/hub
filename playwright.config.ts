import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;
/** A second server, with the example data, for the accessibility checks. */
const A11Y_PORT = 4175;
const A11Y = /accessibility\.spec\.ts/;

// End-to-end tests run against the production build (npm run build first),
// once at iPhone size in WebKit and once at desktop size in Chromium. The
// accessibility checks run against their own server filled with the example data,
// so pages are checked with lists and charts, not only their empty states.
export default defineConfig({
  testDir: "e2e",
  // Runs once the server is up: finishes first-run setup for the empty test database.
  globalSetup: "./e2e/global-setup.ts",
  outputDir: "test-results",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "iphone", use: { ...devices["iPhone 17"] }, testIgnore: A11Y },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
      testIgnore: A11Y,
    },
    {
      name: "iphone-a11y",
      use: { ...devices["iPhone 17"], baseURL: `http://127.0.0.1:${A11Y_PORT}` },
      testMatch: A11Y,
    },
    {
      name: "desktop-a11y",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        baseURL: `http://127.0.0.1:${A11Y_PORT}`,
      },
      testMatch: A11Y,
    },
  ],
  webServer: [
    {
      command: "node scripts/e2e-server.mjs",
      url: `http://127.0.0.1:${PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { HUB_PORT: String(PORT) },
    },
    {
      command: "node scripts/e2e-server.mjs",
      url: `http://127.0.0.1:${A11Y_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { HUB_PORT: String(A11Y_PORT), HUB_E2E_DATA_DIR: ".e2e-a11y-data" },
    },
  ],
});
