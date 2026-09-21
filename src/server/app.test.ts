import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "./app";
import { decodeHeaderName } from "./auth";
import { loadConfig } from "./config";
import { openDatabase } from "./db/client";
import { migrateWithBackup } from "./db/migrate";

const OWNER = "john.smith@example.com";
const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

async function setup() {
  const dataDir = mkdtempSync(join(tmpdir(), "hub-app-"));
  const config = loadConfig(
    {
      NODE_ENV: "test",
      HUB_AUTH_MODE: "tailscale",
      HUB_OWNER_LOGIN: OWNER,
      HUB_DATA_DIR: dataDir,
      HUB_MIGRATIONS_DIR: "drizzle",
    },
    join("/srv", "hub", "src", "server"),
  );
  const { sqlite, db } = openDatabase(":memory:");
  await migrateWithBackup({
    sqlite,
    db,
    migrationsDir: config.migrationsDir,
    backupDir: config.backupDir,
  });
  cleanups.push(() => {
    sqlite.close();
    rmSync(dataDir, { recursive: true, force: true });
  });
  return createApp({ config, db, sqlite, startedAt: new Date() });
}

const owner = {
  "Tailscale-User-Login": "John.Smith@example.com",
  "Tailscale-User-Name": "John Smith",
};
const json = { ...owner, "Content-Type": "application/json" };

describe("authentication", () => {
  it("serves the health check without identity", async () => {
    const app = await setup();
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, version: "dev" });
  });

  it("rejects requests that did not come through Tailscale", async () => {
    const app = await setup();
    expect((await app.request("/api/me")).status).toBe(401);
    expect((await app.request("/")).status).toBe(401);
  });

  it("rejects other Tailscale users", async () => {
    const app = await setup();
    const res = await app.request("/api/me", {
      headers: { "Tailscale-User-Login": "jane@example.com" },
    });
    expect(res.status).toBe(403);
  });

  it("accepts the owner, ignoring letter case", async () => {
    const app = await setup();
    const res = await app.request("/api/me", { headers: owner });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ login: OWNER, name: "John Smith" });
  });

  it("decodes encoded display names", () => {
    expect(decodeHeaderName("=?utf-8?q?Jos=C3=A9_Smith?=")).toBe("José Smith");
    expect(decodeHeaderName("=?utf-8?b?Sm9zw6kgU21pdGg=?=")).toBe("José Smith");
    expect(decodeHeaderName("John Smith")).toBe("John Smith");
    expect(decodeHeaderName(undefined)).toBe("");
  });
});

describe("settings API", () => {
  it("returns defaults, saves changes, and rejects invalid values", async () => {
    const app = await setup();
    const initial = await app.request("/api/settings", { headers: owner });
    expect(await initial.json()).toEqual({ accentColor: "#22d3ee" });

    const saved = await app.request("/api/settings", {
      method: "PUT",
      headers: json,
      body: JSON.stringify({ accentColor: "#FF5FB7" }),
    });
    expect(saved.status).toBe(200);
    expect(await saved.json()).toEqual({ accentColor: "#ff5fb7" });

    const reread = await app.request("/api/settings", { headers: owner });
    expect(await reread.json()).toEqual({ accentColor: "#ff5fb7" });

    const invalid = await app.request("/api/settings", {
      method: "PUT",
      headers: json,
      body: JSON.stringify({ accentColor: "pink" }),
    });
    expect(invalid.status).toBe(400);
  });

  it("blocks cross-site writes and allows same-origin ones", async () => {
    const app = await setup();
    const body = JSON.stringify({ accentColor: "#4c8dff" });
    const put = (headers: Record<string, string>) =>
      app.request("/api/settings", { method: "PUT", headers: { ...json, ...headers }, body });

    expect((await put({ "Sec-Fetch-Site": "cross-site" })).status).toBe(403);
    expect((await put({ Origin: "https://evil.example", Host: "hub.example.ts.net" })).status).toBe(
      403,
    );
    expect((await put({ Origin: "null", Host: "hub.example.ts.net" })).status).toBe(403);
    expect((await put({ "Sec-Fetch-Site": "same-origin" })).status).toBe(200);
    expect(
      (await put({ Origin: "https://hub.example.ts.net", Host: "hub.example.ts.net" })).status,
    ).toBe(200);
    // Non-browser clients send neither header.
    expect((await put({})).status).toBe(200);
  });
});

describe("system API and headers", () => {
  it("reports deployment details", async () => {
    const app = await setup();
    const res = await app.request("/api/system", { headers: owner });
    const body = await res.json();
    expect(body).toMatchObject({
      appName: "Hub",
      version: "dev",
      authMode: "tailscale",
      backups: { count: 0, latest: null, keepDays: 14, scheduledHour: 3 },
      user: { login: OWNER },
    });
  });

  it("sends security headers and a JSON 404 for unknown API routes", async () => {
    const app = await setup();
    const res = await app.request("/api/nope", { headers: owner });
    expect(res.status).toBe(404);
    expect(res.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });
});
