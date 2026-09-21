import { join, resolve, sep } from "node:path";
import { z } from "zod";

export class ConfigError extends Error {
  override name = "ConfigError";
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HUB_HOST: z.string().min(1).default("127.0.0.1"),
  HUB_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HUB_DATA_DIR: z.string().min(1).default("./data"),
  HUB_AUTH_MODE: z.enum(["tailscale", "dev"]).default("tailscale"),
  HUB_OWNER_LOGIN: z.string().trim().toLowerCase().min(3).optional(),
  HUB_DEV_LOGIN: z.string().trim().toLowerCase().min(3).default("john.smith@example.com"),
  HUB_APP_NAME: z.string().trim().min(1).max(40).default("Hub"),
  HUB_TIMEZONE: z.string().min(1).default("UTC"),
  HUB_BACKUP_HOUR: z.coerce.number().int().min(0).max(23).default(3),
  HUB_BACKUP_KEEP_DAYS: z.coerce.number().int().min(1).max(365).default(14),
  HUB_VERSION: z.string().min(1).default("dev"),
  HUB_STATIC_DIR: z.string().min(1).optional(),
  HUB_MIGRATIONS_DIR: z.string().min(1).optional(),
});

export type Config = {
  env: "development" | "test" | "production";
  host: string;
  port: number;
  dataDir: string;
  dbFile: string;
  backupDir: string;
  auth: { mode: "tailscale"; ownerLogin: string } | { mode: "dev"; devLogin: string };
  appName: string;
  timeZone: string;
  backupHour: number;
  backupKeepDays: number;
  version: string;
  /** Built browser app to serve. Undefined in development, where Vite serves it. */
  staticDir: string | undefined;
  migrationsDir: string;
};

/**
 * Reads configuration from environment variables. `here` is the directory of the
 * running server file and is only overridden in tests.
 */
export function loadConfig(
  env: Record<string, string | undefined> = process.env,
  here: string = import.meta.dirname,
): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new ConfigError(`Invalid configuration:\n${z.prettifyError(parsed.error)}`);
  }
  const e = parsed.data;

  let auth: Config["auth"];
  if (e.HUB_AUTH_MODE === "dev") {
    if (e.NODE_ENV === "production") {
      throw new ConfigError("HUB_AUTH_MODE=dev is not allowed when NODE_ENV=production.");
    }
    auth = { mode: "dev", devLogin: e.HUB_DEV_LOGIN };
  } else {
    if (!e.HUB_OWNER_LOGIN) {
      throw new ConfigError(
        "Set HUB_OWNER_LOGIN to the Tailscale login allowed to use this app (for example john.smith@example.com).",
      );
    }
    auth = { mode: "tailscale", ownerLogin: e.HUB_OWNER_LOGIN };
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: e.HUB_TIMEZONE });
  } catch {
    throw new ConfigError(
      `HUB_TIMEZONE "${e.HUB_TIMEZONE}" is not a valid IANA time zone (for example America/New_York).`,
    );
  }

  const dataDir = resolve(e.HUB_DATA_DIR);
  const runningFromBuild = here.endsWith(`${sep}dist${sep}server`);

  return {
    env: e.NODE_ENV,
    host: e.HUB_HOST,
    port: e.HUB_PORT,
    dataDir,
    dbFile: join(dataDir, "hub.db"),
    backupDir: join(dataDir, "backups"),
    auth,
    appName: e.HUB_APP_NAME,
    timeZone: e.HUB_TIMEZONE,
    backupHour: e.HUB_BACKUP_HOUR,
    backupKeepDays: e.HUB_BACKUP_KEEP_DAYS,
    version: e.HUB_VERSION,
    staticDir: e.HUB_STATIC_DIR
      ? resolve(e.HUB_STATIC_DIR)
      : runningFromBuild
        ? resolve(here, "../client")
        : undefined,
    migrationsDir: e.HUB_MIGRATIONS_DIR
      ? resolve(e.HUB_MIGRATIONS_DIR)
      : resolve(here, "../../drizzle"),
  };
}
