import type { Tone } from "../../client/components/StatusDot";
import { formatBytes, formatDuration, formatHour, formatRelative } from "../../client/lib/format";

export type SystemInfo = {
  version: string;
  authMode: "tailscale" | "dev";
  uptimeSeconds: number;
  database: { sizeBytes: number };
  backups: {
    count: number;
    keepDays: number;
    scheduledHour: number;
    latest: { name: string; sizeBytes: number; createdAt: string } | null;
  };
  user: { login: string; name: string };
};

export type SystemCheck = { id: string; label: string; value: string; detail: string; tone: Tone };

const STALE_BACKUP_MS = 26 * 60 * 60 * 1000;

/** Turns /api/system into the status tiles on the home screen. */
export function systemChecks(info: SystemInfo, now: Date): SystemCheck[] {
  const latest = info.backups.latest;
  let backup: SystemCheck;
  if (!latest) {
    backup = {
      id: "backups",
      label: "Backups",
      value: "None yet",
      detail: `First one runs after ${formatHour(info.backups.scheduledHour)}`,
      tone: "warn",
    };
  } else {
    const createdAt = new Date(latest.createdAt);
    const stale = now.getTime() - createdAt.getTime() > STALE_BACKUP_MS;
    backup = {
      id: "backups",
      label: "Backups",
      value: formatRelative(createdAt, now),
      detail: stale
        ? "Older than a day. Check the app logs."
        : `Kept for ${info.backups.keepDays} days`,
      tone: stale ? "danger" : "ok",
    };
  }

  return [
    {
      id: "sign-in",
      label: "Sign-in",
      value: info.authMode === "tailscale" ? "Tailscale" : "Dev login",
      detail: info.user.login,
      tone: info.authMode === "tailscale" ? "ok" : "warn",
    },
    {
      id: "database",
      label: "Database",
      value: formatBytes(info.database.sizeBytes),
      detail: "Up to date",
      tone: "ok",
    },
    backup,
    {
      id: "build",
      label: "Build",
      value: info.version,
      detail: `Running for ${formatDuration(info.uptimeSeconds)}`,
      tone: "accent",
    },
  ];
}

const severity: Record<Tone, number> = { danger: 3, warn: 2, ok: 1, accent: 0, idle: 0 };

export function overallTone(checks: SystemCheck[]): Tone {
  return checks.reduce<Tone>(
    (worst, check) => (severity[check.tone] > severity[worst] ? check.tone : worst),
    "ok",
  );
}
