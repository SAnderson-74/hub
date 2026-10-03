import { type FullConfig, request } from "@playwright/test";

/**
 * The test database starts empty, which would show first-run setup on every page.
 * Finish it once with every module on; e2e/setup.spec.ts covers the setup page.
 */
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use.baseURL;
  const context = await request.newContext({ baseURL });
  const modules = Object.fromEntries(
    ["tasks", "time", "goals", "courses", "resale", "money", "taxes", "business"].map((id) => [
      id,
      true,
    ]),
  );
  const res = await context.post("/api/setup", { data: { modules, timeZone: "", demo: false } });
  if (!res.ok()) throw new Error(`Setup failed: ${res.status()} ${await res.text()}`);
  await context.dispose();
}
