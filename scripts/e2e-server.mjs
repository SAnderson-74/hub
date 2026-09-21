// Starts the production build with a throwaway database for Playwright.
import { rmSync } from "node:fs";

const dataDir = ".e2e-data";
rmSync(dataDir, { recursive: true, force: true });

Object.assign(process.env, {
  NODE_ENV: "test",
  HUB_AUTH_MODE: "dev",
  HUB_DEV_LOGIN: "john.smith@example.com",
  HUB_DATA_DIR: dataDir,
  HUB_TIMEZONE: "America/New_York",
  HUB_PORT: process.env.HUB_PORT ?? "4173",
});

await import("../dist/server/index.js");
