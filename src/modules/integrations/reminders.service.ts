import { and, desc, eq, gte, inArray, isNull, lte, ne, notLike, or } from "drizzle-orm";
import type { Config } from "../../server/config";
import type { Db, Queryable } from "../../server/db/client";
import { log } from "../../server/log";
import { OPEN_LEAD_STATUSES } from "../../shared/business";
import type { Reminder } from "../../shared/homeAssistant";
import { addDays } from "../../shared/recurrence";
import { inWindow, type ReminderKind, type ReminderSettings } from "../../shared/reminders";
import { streakState } from "../../shared/streak";
import { businessLeads, businessSteps } from "../business/schema";
import { readSettings } from "../core/settings.service";
import { studyStreak } from "../education/streak.service";
import { goals, milestones } from "../goals/schema";
import { tasks } from "../tasks/schema";
import { sendReminder, todayTasks, upcomingDates } from "./homeAssistant.service";
import { reminderSends } from "./schema";

/** How far ahead the digest's "coming up" line looks. */
const DIGEST_AHEAD_DAYS = 3;
/** After a failed send, wait this long before trying again. */
const RETRY_MS = 15 * 60_000;

type Clock = { date: string; minutes: number };

/** Today's date and the minutes past midnight, in Hub's time zone. */
export function localClock(now: Date, timeZone: string): Clock {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

/** "today", "tomorrow", or "Thu, Mar 7". */
function whenLabel(date: string, today: string): string {
  if (date === today) return "today";
  if (date === addDays(today, 1)) return "tomorrow";
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// What each reminder says

export type DueItem = { key: string; kind: string; title: string; date: string };

/** Unfinished things due from today through `days` ahead, soonest first. */
export function dueItems(db: Queryable, today: string, days: number): DueItem[] {
  return datedItems(db, today, addDays(today, days));
}

/**
 * Unfinished things dated from `from` through `to`: tasks, active goals and their
 * milestones, business steps, and open leads' next steps. Soonest first.
 */
export function datedItems(db: Queryable, from: string, to: string): DueItem[] {
  const items: DueItem[] = [];
  for (const task of db
    .select({ id: tasks.id, title: tasks.title, date: tasks.dueDate })
    .from(tasks)
    .where(and(ne(tasks.status, "done"), gte(tasks.dueDate, from), lte(tasks.dueDate, to)))
    .all()) {
    if (task.date)
      items.push({ key: `task:${task.id}`, kind: "task", title: task.title, date: task.date });
  }
  const active = db
    .select({ id: goals.id, title: goals.title, date: goals.targetDate })
    .from(goals)
    .where(eq(goals.status, "active"))
    .all();
  for (const goal of active) {
    if (goal.date && goal.date >= from && goal.date <= to) {
      items.push({ key: `goal:${goal.id}`, kind: "goal", title: goal.title, date: goal.date });
    }
  }
  const goalIds = active.map((goal) => goal.id);
  if (goalIds.length > 0) {
    for (const milestone of db
      .select({ id: milestones.id, title: milestones.title, date: milestones.targetDate })
      .from(milestones)
      .where(
        and(
          inArray(milestones.goalId, goalIds),
          isNull(milestones.doneAt),
          gte(milestones.targetDate, from),
          lte(milestones.targetDate, to),
        ),
      )
      .all()) {
      if (milestone.date) {
        items.push({
          key: `milestone:${milestone.id}`,
          kind: "milestone",
          title: milestone.title,
          date: milestone.date,
        });
      }
    }
  }
  for (const step of db
    .select({ id: businessSteps.id, title: businessSteps.title, date: businessSteps.dueOn })
    .from(businessSteps)
    .where(
      and(
        eq(businessSteps.done, false),
        gte(businessSteps.dueOn, from),
        lte(businessSteps.dueOn, to),
      ),
    )
    .all()) {
    if (step.date) {
      items.push({
        key: `step:${step.id}`,
        kind: "business step",
        title: step.title,
        date: step.date,
      });
    }
  }
  for (const lead of db
    .select({
      id: businessLeads.id,
      name: businessLeads.name,
      nextStep: businessLeads.nextStep,
      date: businessLeads.nextStepOn,
    })
    .from(businessLeads)
    .where(
      and(
        or(...OPEN_LEAD_STATUSES.map((status) => eq(businessLeads.status, status))),
        gte(businessLeads.nextStepOn, from),
        lte(businessLeads.nextStepOn, to),
      ),
    )
    .all()) {
    if (lead.date) {
      items.push({
        key: `lead:${lead.id}`,
        kind: "lead",
        title: lead.nextStep ? `${lead.nextStep}: ${lead.name}` : lead.name,
        date: lead.date,
      });
    }
  }
  return items.sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : a.title.localeCompare(b.title),
  );
}

/** The morning digest: today's tasks, what's coming up, and the streak. Null on a quiet day. */
export function digestReminder(
  db: Db,
  config: Pick<Config, "timeZone">,
  now: Date,
): Reminder | null {
  const today = localClock(now, config.timeZone).date;
  const tasksToday = todayTasks(db, today, config.timeZone);
  const soon = upcomingDates(db, today, DIGEST_AHEAD_DAYS);
  if (tasksToday.open === 0 && soon.length === 0) return null;
  const settings = readSettings(db);
  const streak = studyStreak(db, {
    now,
    timeZone: config.timeZone,
    minimum: settings.studyMinimumMinutes,
  });
  const lines = [
    tasksToday.open > 0
      ? `${tasksToday.summary.replace(/\.$/, "")}: ${tasksToday.titles.join(", ")}${
          tasksToday.open > tasksToday.titles.length
            ? `, and ${tasksToday.open - tasksToday.titles.length} more`
            : ""
        }.`
      : "Nothing due today.",
    soon.length > 0
      ? `Coming up: ${soon
          .slice(0, 5)
          .map((item) => `${item.title} (${whenLabel(item.date, today)})`)
          .join(", ")}.`
      : "",
    streak.current > 0 ? `Study streak: ${plural(streak.current, "day")}.` : "",
  ].filter(Boolean);
  return {
    kind: "digest",
    title:
      tasksToday.open > 0
        ? `Today: ${plural(tasksToday.open, "task")}${tasksToday.overdue > 0 ? `, ${tasksToday.overdue} overdue` : ""}`
        : "Coming up soon",
    message: lines.join(" "),
  };
}

/** Things coming due that haven't been reminded about yet for that date. */
export function dueSoonReminder(
  db: Queryable,
  today: string,
  days: number,
): { reminder: Reminder; keys: string[] } | null {
  const sent = new Set(
    db
      .select({ key: reminderSends.key })
      .from(reminderSends)
      .where(eq(reminderSends.kind, "due_soon"))
      .all()
      .map((row) => row.key),
  );
  const items = dueItems(db, today, days).filter((item) => !sent.has(dueKey(item)));
  if (items.length === 0) return null;
  const [first] = items;
  const shown = items.slice(0, 6);
  return {
    reminder: {
      kind: "due_soon",
      title:
        items.length === 1 && first
          ? `Due ${whenLabel(first.date, today)}: ${first.title}`
          : `${plural(items.length, "thing")} due soon`,
      message: `${shown.map((item) => `${item.title}, ${whenLabel(item.date, today)}`).join(". ")}.${
        items.length > shown.length ? ` And ${items.length - shown.length} more.` : ""
      }`,
    },
    keys: items.map(dueKey),
  };
}

const dueKey = (item: DueItem) => `due:${item.key}:${item.date}`;

/** A nudge when there's a streak and today's minimum isn't met yet. */
export function streakReminder(
  db: Db,
  config: Pick<Config, "timeZone">,
  now: Date,
): Reminder | null {
  const settings = readSettings(db);
  const streak = studyStreak(db, {
    now,
    timeZone: config.timeZone,
    minimum: settings.studyMinimumMinutes,
  });
  if (streakState(streak) !== "at_risk") return null;
  const left = streak.minimum - streak.todayMinutes;
  return {
    kind: "streak",
    title: `Keep your ${streak.current}-day study streak`,
    message: `Study ${plural(left, "more minute")} today to keep it going.`,
  };
}

// Sending

type Built = { reminder: Reminder; keys: string[] };

function build(
  db: Db,
  config: Pick<Config, "timeZone">,
  kind: ReminderKind,
  settings: ReminderSettings,
  now: Date,
): Built | null {
  const today = localClock(now, config.timeZone).date;
  if (kind === "due_soon") return dueSoonReminder(db, today, settings.dueSoon.days);
  const reminder =
    kind === "digest" ? digestReminder(db, config, now) : streakReminder(db, config, now);
  return reminder ? { reminder, keys: [] } : null;
}

const SETTING: Record<ReminderKind, keyof ReminderSettings> = {
  digest: "digest",
  due_soon: "dueSoon",
  streak: "streak",
};

const dayKey = (kind: ReminderKind, date: string) => `${kind}:${date}`;

function sentToday(db: Queryable, kind: ReminderKind, date: string): boolean {
  return (
    db
      .select({ id: reminderSends.id })
      .from(reminderSends)
      .where(eq(reminderSends.key, dayKey(kind, date)))
      .get() !== undefined
  );
}

function record(db: Db, kind: ReminderKind, date: string, built: Built, now: Date) {
  const keys = [dayKey(kind, date), ...built.keys];
  db.insert(reminderSends)
    .values(
      keys.map((key) => ({
        kind,
        key,
        title: built.reminder.title,
        message: built.reminder.message,
        sentAt: now,
      })),
    )
    .onConflictDoNothing()
    .run();
}

export type ReminderOutcome = { kind: ReminderKind; ok: boolean; detail: string };

/** Last failed try per reminder and day, so a Home Assistant outage isn't retried every minute. */
const lastTry = new Map<string, number>();

/** For tests: forget failed tries. */
export function resetReminderTries() {
  lastTry.clear();
}

/**
 * Sends each enabled reminder whose time has come today and that hasn't gone out
 * yet. Does nothing without a reminder webhook address.
 */
export async function runReminders(
  db: Db,
  config: Pick<Config, "timeZone">,
  now = new Date(),
): Promise<ReminderOutcome[]> {
  const settings = readSettings(db);
  if (!settings.homeAssistant.reminderUrl) return [];
  const clock = localClock(now, config.timeZone);
  const outcomes: ReminderOutcome[] = [];
  for (const kind of ["digest", "due_soon", "streak"] as const) {
    const setting = settings.reminders[SETTING[kind]];
    if (!setting.enabled || !inWindow(setting.time, clock.minutes)) continue;
    if (sentToday(db, kind, clock.date)) continue;
    const tryKey = dayKey(kind, clock.date);
    if (now.getTime() - (lastTry.get(tryKey) ?? 0) < RETRY_MS) continue;
    const built = build(db, config, kind, settings.reminders, now);
    if (!built) continue;
    const delivery = await sendReminder(db, built.reminder, now);
    if (delivery?.ok) {
      record(db, kind, clock.date, built, now);
      lastTry.delete(tryKey);
      log.info("Reminder sent", { kind });
    } else {
      lastTry.set(tryKey, now.getTime());
    }
    outcomes.push({ kind, ok: delivery?.ok ?? false, detail: delivery?.detail ?? "" });
  }
  return outcomes;
}

/** Sends one reminder now, whatever the time, and counts it as today's. */
export async function sendReminderNow(
  db: Db,
  config: Pick<Config, "timeZone">,
  kind: ReminderKind,
  now = new Date(),
): Promise<{ built: Built | null; delivery: Awaited<ReturnType<typeof sendReminder>> }> {
  const settings = readSettings(db);
  const built = build(db, config, kind, settings.reminders, now);
  if (!built) return { built: null, delivery: null };
  const delivery = await sendReminder(db, built.reminder, now);
  if (delivery?.ok) record(db, kind, localClock(now, config.timeZone).date, built, now);
  return { built, delivery };
}

export type ReminderPreview = {
  kind: ReminderKind;
  /** What it would say now, or null when there's nothing to send. */
  reminder: Reminder | null;
  sentToday: boolean;
};

/** What each reminder would say right now, for Settings. Sends nothing. */
export function previewReminders(
  db: Db,
  config: Pick<Config, "timeZone">,
  now = new Date(),
): ReminderPreview[] {
  const settings = readSettings(db);
  const today = localClock(now, config.timeZone).date;
  return (["digest", "due_soon", "streak"] as const).map((kind) => ({
    kind,
    reminder: build(db, config, kind, settings.reminders, now)?.reminder ?? null,
    sentToday: sentToday(db, kind, today),
  }));
}

/** The latest reminders sent, newest first. */
export function recentReminders(db: Queryable, limit = 10) {
  return db
    .select({
      kind: reminderSends.kind,
      title: reminderSends.title,
      message: reminderSends.message,
      sentAt: reminderSends.sentAt,
    })
    .from(reminderSends)
    .where(notLike(reminderSends.key, "due:%"))
    .orderBy(desc(reminderSends.sentAt), desc(reminderSends.id))
    .limit(limit)
    .all()
    .map((row) => ({ ...row, sentAt: row.sentAt.toISOString() }));
}

/**
 * Checks every minute for reminders whose time has come, so a changed time takes
 * effect within a minute. Returns a function that stops it.
 */
export function startReminderScheduler(
  db: Db,
  config: Pick<Config, "timeZone">,
  intervalMs = 60_000,
): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runReminders(db, config);
    } catch (error) {
      log.warn("Reminder check failed", { error: error instanceof Error ? error.name : "unknown" });
    } finally {
      running = false;
    }
  };
  void tick();
  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
