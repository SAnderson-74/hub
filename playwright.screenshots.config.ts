import { readFileSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

const PORT = 4174;
// Chromium for both sizes, so screenshots can be made anywhere Chromium runs.
// PLAYWRIGHT_CHROMIUM_PATH points at a browser installed outside Playwright.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;
const { defaultBrowserType: _webkit, ...iphone } = devices["iPhone 17"];
const { version } = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };

// `npm run screenshots`: starts the production build on a fresh database, adds the
// example data, and saves the main screens to docs/screenshots/ for the README.
export default defineConfig({
  testDir: "screenshots",
  outputDir: "test-results/screenshots",
  workers: 1,
  reporter: "list",
  globalSetup: "./screenshots/global-setup.ts",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    // The same time zone as the server, so "today" agrees.
    timezoneId: "America/New_York",
    colorScheme: "dark",
    launchOptions: { executablePath },
  },
  projects: [
    { name: "phone", use: { ...iphone, deviceScaleFactor: 2 } },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: "node scripts/e2e-server.mjs",
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { HUB_PORT: String(PORT), HUB_E2E_DATA_DIR: ".screenshot-data", HUB_VERSION: version },
  },
});
