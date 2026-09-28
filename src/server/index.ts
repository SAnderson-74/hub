import { existsSync, mkdirSync } from "node:fs";
import { serve } from "@hono/node-server";
import { startHomeAssistantScheduler } from "../modules/integrations/homeAssistant.service";
import { startReminderScheduler } from "../modules/integrations/reminders.service";
import { createApp } from "./app";
import { type Config, ConfigError, loadConfig } from "./config";
import { startBackupScheduler } from "./db/backup";
import { openDatabase } from "./db/client";
import { migrateWithBackup } from "./db/migrate";
import { makePrivate } from "./db/private";
import { applyPendingRestore } from "./db/restore";
import { errorFields, log } from "./log";

/**
 * Opens the database (putting a staged restore in place first), migrates it, and
 * starts serving. Returns a function that stops all of it and closes the database.
 */
async function start(config: Config, restart: () => void): Promise<() => Promise<void>> {
  applyPendingRestore(config.dataDir, config.dbFile);
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

  const stopHomeAssistant = startHomeAssistantScheduler(db, config);
  const stopReminders = startReminderScheduler(db, config);

  const app = createApp({ config, db, sqlite, startedAt: new Date(), restart });
  const server = serve({ fetch: app.fetch, hostname: config.host, port: config.port }, (info) => {
    log.info("Listening", {
      address: info.address,
      port: info.port,
      version: config.version,
      auth: config.auth.mode,
      servesBrowserApp: Boolean(config.staticDir),
    });
  });

  return () =>
    new Promise((resolve) => {
      stopBackups();
      stopHomeAssistant();
      stopReminders();
      server.close(() => {
        sqlite.close();
        resolve();
      });
      // Idle keep-alive connections would otherwise hold the port open.
      if ("closeAllConnections" in server) server.closeAllConnections();
    });
}

async function main() {
  if (process.env.NODE_ENV !== "production" && existsSync(".env")) {
    process.loadEnvFile(".env");
  }
  const config = loadConfig();
  // New files (the database, its WAL files, backups) are readable by this user only.
  process.umask(0o077);
  mkdirSync(config.backupDir, { recursive: true });
  makePrivate(config.dataDir);

  let closing = false;
  let restarting = false;
  // A restore restarts Hub in place: the same process, a freshly opened database.
  const restart = () => {
    if (closing || restarting) return;
    restarting = true;
    log.info("Restarting");
    stop()
      .then(() => start(config, restart))
      .then((next) => {
        stop = next;
        restarting = false;
      })
      .catch((error: unknown) => {
        // The container starts Hub again, which finishes a staged restore.
        log.error("Failed to restart", errorFields(error));
        process.exit(1);
      });
  };
  let stop = await start(config, restart);

  const shutdown = (signal: string) => {
    if (closing) return;
    closing = true;
    log.info("Shutting down", { signal });
    // Mid-restart there's nothing to wait for; a staged restore finishes at the next start.
    if (restarting) process.exit(0);
    void stop().then(() => process.exit(0));
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
