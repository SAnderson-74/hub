import { describe, expect, it } from "vitest";
import { overallTone, type SystemInfo, systemChecks } from "./system-checks";

const base: SystemInfo = {
  version: "a1b2c3d",
  authMode: "tailscale",
  uptimeSeconds: 7_200,
  database: { sizeBytes: 2 * 1024 * 1024 },
  backups: { count: 0, keepDays: 14, scheduledHour: 3, latest: null },
  user: { login: "john.smith@example.com", name: "John Smith" },
};
const now = new Date("2026-09-16T12:00:00Z");

describe("systemChecks", () => {
  it("flags a missing first backup as needing attention", () => {
    const checks = systemChecks(base, now);
    expect(checks.find((c) => c.id === "backups")).toMatchObject({
      tone: "warn",
      value: "None yet",
    });
    expect(overallTone(checks)).toBe("warn");
  });

  it("is healthy with a recent backup and flags a stale one", () => {
    const recent = systemChecks(
      {
        ...base,
        backups: {
          ...base.backups,
          count: 1,
          latest: { name: "n", sizeBytes: 1, createdAt: "2026-09-16T03:00:00Z" },
        },
      },
      now,
    );
    expect(overallTone(recent)).toBe("ok");
    const stale = systemChecks(
      {
        ...base,
        backups: {
          ...base.backups,
          count: 1,
          latest: { name: "n", sizeBytes: 1, createdAt: "2026-09-14T03:00:00Z" },
        },
      },
      now,
    );
    expect(overallTone(stale)).toBe("danger");
  });

  it("marks development sign-in as needing attention", () => {
    const checks = systemChecks({ ...base, authMode: "dev" }, now);
    expect(checks.find((c) => c.id === "sign-in")?.tone).toBe("warn");
  });
});
