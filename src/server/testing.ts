import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { hc } from "hono/client";
import type { Api } from "./api";
import { createApp } from "./app";
import { loadConfig } from "./config";
import { openDatabase } from "./db/client";

/**
 * The whole app (auth, headers, error handling) over a fresh in-memory database,
 * signed in with the dev login, plus the same typed client the browser uses.
 * Call close() after each test.
 */
export function createTestApp() {
  const config = loadConfig({
    NODE_ENV: "test",
    HUB_AUTH_MODE: "dev",
    HUB_DATA_DIR: join(tmpdir(), "hub-test-unused"),
    HUB_MIGRATIONS_DIR: "drizzle",
  });
  const { sqlite, db } = openDatabase(":memory:");
  migrate(db, { migrationsFolder: config.migrationsDir });
  const app = createApp({ config, db, sqlite, startedAt: new Date() });
  const api = hc<Api>("http://localhost/api", {
    fetch: (input: RequestInfo | URL, init?: RequestInit) => app.request(input, init),
  });
  return { app, api, db, sqlite, close: () => sqlite.close() };
}

export type TestApp = ReturnType<typeof createTestApp>;

type AnyResponse = { ok: boolean; status: number; text(): Promise<string> };

/** The body of a successful response, typed from the route. Fails the test otherwise. */
export async function body<R extends AnyResponse>(
  response: R,
): Promise<Exclude<R, { ok: false }> extends { json(): Promise<infer T> } ? T : never> {
  const text = await response.text();
  if (!response.ok) throw new Error(`Expected success, got ${response.status}: ${text}`);
  return JSON.parse(text);
}

/** Status and { error } of a failed response. */
export async function failure(response: AnyResponse) {
  const text = await response.text();
  return { status: response.status, ...(JSON.parse(text) as { error: string }) };
}
