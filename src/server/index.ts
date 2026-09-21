import { existsSync, mkdirSync } from "node:fs";
import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { ConfigError, loadConfig } from "./config";
import { startBackupScheduler } from "./db/backup";
import { openDatabase } from "./db/client";
import { migrateWithBackup } from "./db/migrate";
import { errorFields, log } from "./log";

async function main() {
  if (process.env.NODE_ENV !== "production" && existsSync(".env")) {
    process.loadEnvFile(".env");
  }
  const config = loadConfig();
  mkdirSync(config.backupDir, { recursive: true });

  const { sqlite, db } = openDatabase(config.dbFile);
  const migration = await migrateWithBackup({
    sqlite,
    db,
    migrationsDir: config.migrationsDir,
    backupDir: config.backupDir,
  });
  if (migration.applied > 0) log.info("Database migrated", migration);

  const stopBackups = startBackupScheduler({
    sqlite,
    dir: config.backupDir,
    timeZone: config.timeZone,
    hour: config.backupHour,
    keepDays: config.backupKeepDays,
  });

  const app = createApp({ config, db, sqlite, startedAt: new Date() });
  const server = serve({ fetch: app.fetch, hostname: config.host, port: config.port }, (info) => {
    log.info("Listening", {
      address: info.address,
      port: info.port,
      version: config.version,
      auth: config.auth.mode,
      servesBrowserApp: Boolean(config.staticDir),
    });
  });

  let closing = false;
  const shutdown = (signal: string) => {
    if (closing) return;
    closing = true;
    log.info("Shutting down", { signal });
    stopBackups();
    server.close(() => {
      sqlite.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((error: unknown) => {
  if (error instanceof ConfigError) log.error(error.message);
  else log.error("Failed to start", errorFields(error));
  process.exit(1);
});
