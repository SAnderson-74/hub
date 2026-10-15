import { type FullConfig, request } from "@playwright/test";

/** Finishes first-run setup on the fresh database with every module and the example data. */
export default async function globalSetup(config: FullConfig) {
  const context = await request.newContext({ baseURL: config.projects[0]?.use.baseURL });
  const modules = Object.fromEntries(
    ["tasks", "time", "goals", "courses", "resale", "money", "taxes", "business"].map((id) => [
      id,
      true,
    ]),
  );
  const res = await context.post("/api/setup", { data: { modules, timeZone: "", demo: true } });
  if (!res.ok()) throw new Error(`Setup failed: ${res.status()} ${await res.text()}`);
  await context.dispose();
}
