import { randomBytes, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Config } from "../../server/config";
import type { Db, Queryable } from "../../server/db/client";
import { addDays } from "../../shared/recurrence";
import { settings } from "../core/schema";
import { type DueItem, datedItems, localClock } from "./reminders.service";

// A calendar feed (ICS) of Hub's dated things, for a phone or computer calendar to
// subscribe to. It sits behind Tailscale like everything else, and also needs a
// secret token in its address, so it's off until turned on and a new address
// replaces the old one.

/** Stored apart from the settings the browser reads and writes, so it can't be set from outside. */
const TOKEN_KEY = "calendarFeedToken";

/** How far back and ahead the feed reaches, in days. */
const PAST_DAYS = 60;
const AHEAD_DAYS = 366;

export function readFeedToken(db: Queryable): string | null {
  const row = db.select().from(settings).where(eq(settings.key, TOKEN_KEY)).get();
  return typeof row?.value === "string" && row.value !== "" ? row.value : null;
}

/** Turns the feed on with a new token, replacing any old one. */
export function newFeedToken(db: Db): string {
  const token = randomBytes(24).toString("base64url");
  const now = new Date();
  db.insert(settings)
    .values({ key: TOKEN_KEY, value: token, updatedAt: now })
    .onConflictDoUpdate({ target: settings.key, set: { value: token, updatedAt: now } })
    .run();
  return token;
}

/** Turns the feed off. */
export function clearFeedToken(db: Db): void {
  db.delete(settings).where(eq(settings.key, TOKEN_KEY)).run();
}

/** Whether `given` is the feed's token, compared in constant time. */
export function isFeedToken(db: Queryable, given: string): boolean {
  const token = readFeedToken(db);
  if (!token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

// ICS (RFC 5545)

/** Escapes text values: backslash, semicolon, comma, and newlines. */
export function escapeText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Folds a content line to 75 octets, continuing with a space, without splitting a
 * multi-byte character.
 */
export function foldLine(line: string): string {
  const parts: string[] = [];
  let current = "";
  let size = 0;
  for (const char of line) {
    const bytes = Buffer.byteLength(char);
    // Continuation lines start with a space, which counts toward their 75.
    const limit = parts.length === 0 ? 75 : 74;
    if (size + bytes > limit) {
      parts.push(current);
      current = "";
      size = 0;
    }
    current += char;
    size += bytes;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

const compactDate = (date: string) => date.replace(/-/g, "");

/** "20300301T120000Z" */
const stamp = (now: Date) =>
  now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");

const KIND_LABELS: Record<string, string> = {
  task: "Task",
  goal: "Goal",
  milestone: "Milestone",
  "business step": "Business step",
  lead: "Lead follow-up",
};

/** A calendar of all-day events, one per dated item. */
export function buildCalendar(
  items: readonly DueItem[],
  options: { now: Date; timeZone: string },
): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Hub//Calendar feed//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Hub",
    `X-WR-TIMEZONE:${options.timeZone}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];
  for (const item of items) {
    const kind = KIND_LABELS[item.kind] ?? "Item";
    lines.push(
      "BEGIN:VEVENT",
      // Stable per item, so a changed date moves the event instead of adding one.
      `UID:${item.key.replace(/[^a-z0-9:-]/gi, "-")}@hub`,
      `DTSTAMP:${stamp(options.now)}`,
      `DTSTART;VALUE=DATE:${compactDate(item.date)}`,
      `DTEND;VALUE=DATE:${compactDate(addDays(item.date, 1))}`,
      `SUMMARY:${escapeText(item.title)}`,
      `CATEGORIES:${escapeText(kind)}`,
      `DESCRIPTION:${escapeText(`${kind} in Hub`)}`,
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}

/** The feed as it is now: unfinished things from two months back through a year ahead. */
export function calendarFeed(
  db: Queryable,
  config: Pick<Config, "timeZone">,
  now = new Date(),
): string {
  const today = localClock(now, config.timeZone).date;
  const items = datedItems(db, addDays(today, -PAST_DAYS), addDays(today, AHEAD_DAYS));
  return buildCalendar(items, { now, timeZone: config.timeZone });
}
