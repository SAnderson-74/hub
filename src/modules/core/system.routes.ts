import { statSync } from "node:fs";
import { Hono } from "hono";
import { listBackups } from "../../server/db/backup";
import type { Deps } from "../../server/deps";
import type { AppEnv } from "../../server/env";

function fileSize(path: string): number {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}

/** Health and deployment details shown on the home screen. No personal data. */
export function systemRoutes({ config, startedAt }: Deps) {
  return new Hono<AppEnv>().get("/", (c) => {
    const backups = listBackups(config.backupDir);
    const latest = backups[0];
    return c.json({
      appName: config.appName,
      version: config.version,
      nodeVersion: process.version,
      authMode: config.auth.mode,
      startedAt: startedAt.toISOString(),
      uptimeSeconds: Math.round((Date.now() - startedAt.getTime()) / 1000),
      timeZone: config.timeZone,
      database: {
        sizeBytes: fileSize(config.dbFile) + fileSize(`${config.dbFile}-wal`),
      },
      backups: {
        count: backups.length,
        keepDays: config.backupKeepDays,
        scheduledHour: config.backupHour,
        latest: latest
          ? {
              name: latest.name,
              sizeBytes: latest.sizeBytes,
              createdAt: latest.createdAt.toISOString(),
            }
          : null,
      },
      user: c.get("user"),
    });
  });
}
