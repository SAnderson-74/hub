import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "./config";

const base = { HUB_OWNER_LOGIN: "john.smith@example.com", HUB_DATA_DIR: "/tmp/hub-config-test" };

describe("loadConfig", () => {
  it("never allows development sign-in in production", () => {
    expect(() => loadConfig({ NODE_ENV: "production", HUB_AUTH_MODE: "dev" })).toThrow(ConfigError);
  });

  it("requires an owner login for Tailscale sign-in", () => {
    expect(() => loadConfig({ NODE_ENV: "production" })).toThrow(/HUB_OWNER_LOGIN/);
  });

  it("rejects unknown time zones and bad ports", () => {
    expect(() => loadConfig({ ...base, HUB_TIMEZONE: "Mars/Olympus" })).toThrow(/HUB_TIMEZONE/);
    expect(() => loadConfig({ ...base, HUB_PORT: "99999" })).toThrow(ConfigError);
  });

  it("serves the built app only when running from dist", () => {
    const fromBuild = loadConfig(base, join("/app", "dist", "server"));
    expect(fromBuild.staticDir).toBe(join("/app", "dist", "client"));
    expect(fromBuild.migrationsDir).toBe(join("/app", "drizzle"));

    const fromSource = loadConfig(base, join("/repo", "src", "server"));
    expect(fromSource.staticDir).toBeUndefined();
    expect(fromSource.migrationsDir).toBe(join("/repo", "drizzle"));
    expect(fromSource.dbFile).toBe(join("/tmp/hub-config-test", "hub.db"));
  });
});
