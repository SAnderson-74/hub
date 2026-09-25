const DAY_MS = 86_400_000;

/** A date on this device's calendar as YYYY-MM-DD. */
export function localDate(date: Date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Calendar dates as UTC midnights, so day math ignores time zones and DST. */
function toUtc(isoDate: string): Date {
  const [year = 0, month = 1, day = 1] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / DAY_MS);
}

function format(isoDate: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(toUtc(isoDate));
}

export type DueTone = "danger" | "warn" | "muted";

/** A short due-date label, like "Due today", "Due Friday", or "Overdue, Sep 20". */
export function describeDue(dueDate: string, today: string): { label: string; tone: DueTone } {
  const days = daysBetween(today, dueDate);
  const sameYear = dueDate.slice(0, 4) === today.slice(0, 4);
  const short = format(dueDate, {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  });
  if (days < 0) return { label: `Overdue, ${short}`, tone: "danger" };
  if (days === 0) return { label: "Due today", tone: "warn" };
  if (days === 1) return { label: "Due tomorrow", tone: "muted" };
  if (days < 7) return { label: `Due ${format(dueDate, { weekday: "long" })}`, tone: "muted" };
  return { label: `Due ${short}`, tone: "muted" };
}
