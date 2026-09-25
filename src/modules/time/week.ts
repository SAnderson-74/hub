import { formatMinutes } from "../../shared/time";

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** Monday 00:00 (local time) of the week containing `date`. */
export function startOfWeek(date: Date): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const sinceMonday = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - sinceMonday);
  return start;
}

export function addDaysLocal(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

type Timed = { startedAt: string; endedAt: string | null; minutes: number | null };

/** Minutes an entry covers, counting a running timer up to `now`. */
export function entryMinutes(entry: Timed, now: Date): number {
  if (entry.minutes !== null) return entry.minutes;
  return Math.max(0, Math.floor((now.getTime() - new Date(entry.startedAt).getTime()) / 60_000));
}

/**
 * Minutes per day, Monday first. Each entry counts on the day it started, so an
 * entry that runs past midnight stays on one bar.
 */
export function minutesByDay(entries: Timed[], weekStart: Date, now: Date): number[] {
  const days = Array.from({ length: 7 }, () => 0);
  for (const entry of entries) {
    const started = new Date(entry.startedAt);
    const index = Math.floor(
      (startOfDay(started).getTime() - weekStart.getTime()) / 86_400_000 + 0.5,
    );
    if (index >= 0 && index < 7) days[index] = (days[index] ?? 0) + entryMinutes(entry, now);
  }
  return days;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** The chart's one-line summary, like "6 h 30 min this week, most on Tuesday (3 h)." */
export function weekSummary(days: number[], isThisWeek: boolean): string {
  const total = days.reduce((sum, minutes) => sum + minutes, 0);
  const when = isThisWeek ? "this week" : "that week";
  if (total === 0) return `No time logged ${when}.`;
  const most = days.indexOf(Math.max(...days));
  return `${formatMinutes(total)} ${when}, most on ${DAY_NAMES[most]} (${formatMinutes(days[most] ?? 0)}).`;
}

/** "Sep 22 – 28", "Sep 29 – Oct 5", or with years when the week spans two. */
export function formatWeekRange(weekStart: Date): string {
  const end = addDaysLocal(weekStart, 6);
  const month = (date: Date) => date.toLocaleDateString("en-US", { month: "short" });
  if (weekStart.getFullYear() !== end.getFullYear()) {
    const full = { month: "short", day: "numeric", year: "numeric" } as const;
    return `${weekStart.toLocaleDateString("en-US", full)} – ${end.toLocaleDateString("en-US", full)}`;
  }
  if (weekStart.getMonth() === end.getMonth()) {
    return `${month(weekStart)} ${weekStart.getDate()} – ${end.getDate()}`;
  }
  return `${month(weekStart)} ${weekStart.getDate()} – ${month(end)} ${end.getDate()}`;
}

/** "9:05 AM" */
export function formatClock(date: Date): string {
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** A running timer's elapsed time, "0:04:09" or "1:23:45". */
export function formatElapsed(startedAt: string, now: Date): string {
  const seconds = Math.max(0, Math.floor((now.getTime() - new Date(startedAt).getTime()) / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * The instants a draft describes, in this device's time zone. An end time earlier
 * than the start means the entry ran past midnight.
 */
export function draftRange(draft: { date: string; start: string; end: string }) {
  if (!draft.date || !draft.start) return null;
  const startedAt = new Date(`${draft.date}T${draft.start}`);
  if (Number.isNaN(startedAt.getTime())) return null;
  if (!draft.end) return { startedAt, endedAt: null, nextDay: false };
  const endedAt = new Date(`${draft.date}T${draft.end}`);
  if (Number.isNaN(endedAt.getTime())) return null;
  const nextDay = endedAt.getTime() <= startedAt.getTime();
  if (nextDay) endedAt.setDate(endedAt.getDate() + 1);
  return { startedAt, endedAt, nextDay };
}
