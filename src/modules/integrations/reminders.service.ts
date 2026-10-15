import { and, desc, eq, gte, inArray, isNull, lte, ne, notLike, or } from "drizzle-orm";
import type { Config } from "../../server/config";
import type { Db, Queryable } from "../../server/db/client";
import { log } from "../../server/log";
import { OPEN_LEAD_STATUSES } from "../../shared/business";
import type { Reminder } from "../../shared/homeAssistant";
import type { ModuleId } from "../../shared/modules";
import { formatCents } from "../../shared/money";
import { addDays, daysBetween } from "../../shared/recurrence";
import {
  inWindow,
  REMINDER_KINDS,
  type ReminderKind,
  type ReminderSettings,
  TITHING_REPEAT_DAYS,
} from "../../shared/reminders";
import type { Settings } from "../../shared/settings";
import { streakState } from "../../shared/streak";
import { businessLeads, businessSteps } from "../business/schema";
import { readSettings } from "../core/settings.service";
import { assessments, courses } from "../education/schema";
import { studyStreak } from "../education/streak.service";
import { goals, milestones } from "../goals/schema";
import { habitsToRemind } from "../habits/habits.service";
import { billOccurrences } from "../money/bills.service";
import { hasDevices, pushToDevices } from "../push/push.service";
import { tasks } from "../tasks/schema";
import { overview as tithingOverview } from "../tithing/tithing.service";
import { sendReminder, todayTasks } from "./homeAssistant.service";
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

export type DueItem = {
  key: string;
  kind: string;
  title: string;
  date: string;
  /** Where it opens in Hub. */
  href: string;
};

/** Which module each kind of dated thing belongs to. */
const MODULE_OF: Record<string, ModuleId> = {
  task: "tasks",
  goal: "goals",
  milestone: "goals",
  assessment: "courses",
  "business step": "business",
  lead: "business",
  bill: "money",
  income: "money",
};

/** Unfinished things due from today through `days` ahead, soonest first. */
export function dueItems(db: Queryable, today: string, days: number): DueItem[] {
  return datedItems(db, today, addDays(today, days));
}

/**
 * Unfinished things dated from `from` through `to`: tasks, active goals and their
 * milestones, assessments, business steps, and open leads' next steps. Soonest first.
 */
export function datedItems(db: Queryable, from: string, to: string): DueItem[] {
  const items: DueItem[] = [];
  for (const task of db
    .select({ id: tasks.id, title: tasks.title, date: tasks.dueDate })
    .from(tasks)
    .where(and(ne(tasks.status, "done"), gte(tasks.dueDate, from), lte(tasks.dueDate, to)))
    .all()) {
    if (task.date)
      items.push({
        key: `task:${task.id}`,
        kind: "task",
        title: task.title,
        date: task.date,
        href: `/tasks?task=${task.id}`,
      });
  }
  const active = db
    .select({ id: goals.id, title: goals.title, date: goals.targetDate })
    .from(goals)
    .where(eq(goals.status, "active"))
    .all();
  for (const goal of active) {
    if (goal.date && goal.date >= from && goal.date <= to) {
      items.push({
        key: `goal:${goal.id}`,
        kind: "goal",
        title: goal.title,
        date: goal.date,
        href: `/goals?goal=${goal.id}`,
      });
    }
  }
  const goalIds = active.map((goal) => goal.id);
  if (goalIds.length > 0) {
    for (const milestone of db
      .select({
        id: milestones.id,
        goalId: milestones.goalId,
        title: milestones.title,
        date: milestones.targetDate,
      })
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
          href: `/goals?goal=${milestone.goalId}`,
        });
      }
    }
  }
  for (const assessment of db
    .select({
      id: assessments.id,
      label: assessments.label,
      date: assessments.dueOn,
      courseId: courses.id,
      termId: courses.termId,
      code: courses.code,
      course: courses.title,
    })
    .from(assessments)
    .innerJoin(courses, eq(assessments.courseId, courses.id))
    .where(
      and(isNull(assessments.doneAt), gte(assessments.dueOn, from), lte(assessments.dueOn, to)),
    )
    .all()) {
    if (assessment.date) {
      items.push({
        key: `assessment:${assessment.id}`,
        kind: "assessment",
        title: `${assessment.label} (${assessment.code || assessment.course})`,
        date: assessment.date,
        href: `/courses?term=${assessment.termId}&course=${assessment.courseId}`,
      });
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
        href: "/business",
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
        href: `/business?do=leads&lead=${lead.id}`,
      });
    }
  }
  // Bills and repeating income on their schedules. Names only: these also go to the
  // calendar feed, which an outside calendar may fetch, so amounts stay in Hub.
  for (const bill of billOccurrences(db, from, to)) {
    items.push({
      key: `bill:${bill.id}:${bill.date}`,
      kind: bill.kind === "income" ? "income" : "bill",
      title: bill.name,
      date: bill.date,
      href: `/money?book=${bill.bookId}&do=bills`,
    });
  }
  // Only modules that are on: a turned-off module stays out of reminders and the calendar.
  const modules = readSettings(db).modules;
  return items
    .filter((item) => modules[MODULE_OF[item.kind] ?? "tasks"])
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.title.localeCompare(b.title)));
}

/** The morning digest: today's tasks, what's coming up, and the streak. Null on a quiet day. */
export function digestReminder(
  db: Db,
  config: Pick<Config, "timeZone">,
  now: Date,
): Reminder | null {
  const today = localClock(now, config.timeZone).date;
  const settings = readSettings(db);
  const tasksToday = settings.modules.tasks
    ? todayTasks(db, today, config.timeZone)
    : { open: 0, overdue: 0, done: 0, summary: "", titles: [] };
  const soon = datedItems(db, addDays(today, 1), addDays(today, DIGEST_AHEAD_DAYS));
  if (tasksToday.open === 0 && soon.length === 0) return null;
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
    settings.modules.courses && streak.current > 0
      ? `Study streak: ${plural(streak.current, "day")}.`
      : "",
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
  if (!settings.modules.courses) return null;
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

const incomeKey = (id: number) => `tithing-income:${id}`;

/**
 * Unpaid tithing, when there's new income with tithing to pay since the last tithing
 * reminder, or otherwise once every TITHING_REPEAT_DAYS while any stays unpaid. Null
 * when it's all paid, or nothing new came in and it was reminded recently.
 */
export function tithingReminder(
  db: Db,
  today: string,
  now: Date,
): { reminder: Reminder; keys: string[] } | null {
  if (!readSettings(db).modules.tithing) return null;
  const { summary, open } = tithingOverview(db, undefined, now);
  if (summary.unpaidCents <= 0 || open.length === 0) return null;
  const sent = db
    .select({ key: reminderSends.key })
    .from(reminderSends)
    .where(eq(reminderSends.kind, "tithing"))
    .all()
    .map((row) => row.key);
  const mentioned = new Set(sent);
  const fresh = open.filter((row) => !mentioned.has(incomeKey(row.id)));
  // Day keys ("tithing:2030-03-01") sort by date.
  const lastDay = sent
    .filter((key) => /^tithing:\d{4}-\d{2}-\d{2}$/.test(key))
    .map((key) => key.slice("tithing:".length))
    .sort()
    .at(-1);
  const due = lastDay === undefined || daysBetween(lastDay, today) >= TITHING_REPEAT_DAYS;
  if (fresh.length === 0 && !due) return null;
  const freshCents = fresh.reduce((sum, row) => sum + row.owedCents - row.paidCents, 0);
  return {
    reminder: {
      kind: "tithing",
      title:
        fresh.length > 0
          ? `${formatCents(freshCents)} of tithing on new income`
          : `${formatCents(summary.unpaidCents)} of tithing unpaid`,
      message: `${formatCents(summary.unpaidCents)} of tithing is unpaid on ${plural(
        summary.unpaidCount,
        "income",
      )}.${fresh.length > 0 ? ` ${plural(fresh.length, "income")} came in since the last reminder.` : ""}`,
    },
    keys: open.map((row) => incomeKey(row.id)),
  };
}

// Sending

type Built = { reminder: Reminder; keys: string[] };

/** Where tapping a pushed reminder opens. */
const OPENS: Record<ReminderKind | "habit" | "test", string> = {
  habit: "/habits",
  digest: "/",
  due_soon: "/",
  streak: "/courses",
  tithing: "/tithing",
  test: "/settings",
};

/**
 * A reminder without names or amounts, for a phone's lock screen: only counts. Shown
 * unless the device chose to show what's due by name.
 */
function brief(
  db: Db,
  config: Pick<Config, "timeZone">,
  kind: ReminderKind | "habit",
  built: Built,
  now: Date,
): { title: string; body: string } {
  if (kind === "habit") return { title: "Habit", body: "A habit to check off today." };
  if (kind === "digest") {
    const today = localClock(now, config.timeZone).date;
    const settings = readSettings(db);
    const open = settings.modules.tasks ? todayTasks(db, today, config.timeZone).open : 0;
    const soon = datedItems(db, addDays(today, 1), addDays(today, DIGEST_AHEAD_DAYS)).length;
    return {
      title: "Today in Hub",
      body: [
        open > 0 ? `${plural(open, "task")} today.` : "Nothing due today.",
        soon > 0 ? `${plural(soon, "thing")} coming up.` : "",
      ]
        .filter(Boolean)
        .join(" "),
    };
  }
  if (kind === "due_soon") {
    const items = built.keys.length;
    return { title: "Due soon", body: `${plural(items, "thing")} coming due.` };
  }
  if (kind === "tithing") {
    return {
      title: "Tithing",
      body: `Tithing is unpaid on ${plural(built.keys.length, "income")}.`,
    };
  }
  return { title: "Study streak", body: "Study today to keep your streak." };
}

type Delivered = { ok: boolean; detail: string };

/**
 * Sends a reminder everywhere it goes: Home Assistant when its webhook is set, and each
 * device with notifications on. It counts as sent when either got it.
 */
async function deliver(
  db: Db,
  config: Pick<Config, "timeZone">,
  kind: ReminderKind | "habit",
  built: Built,
  now: Date,
): Promise<Delivered> {
  const results: Delivered[] = [];
  if (readSettings(db).homeAssistant.reminderUrl) {
    const delivery = await sendReminder(db, built.reminder, now);
    if (delivery) results.push(delivery);
  }
  if (hasDevices(db)) {
    const outcome = await pushToDevices(
      db,
      {
        title: built.reminder.title,
        body: built.reminder.message,
        brief: brief(db, config, kind, built, now),
        tag: kind === "habit" ? `hub-habit-${built.keys[0] ?? ""}` : `hub-${kind}`,
        url: OPENS[kind],
      },
      now,
    );
    results.push({ ok: outcome.sent > 0, detail: outcome.detail });
  }
  const ok = results.some((result) => result.ok);
  return {
    ok,
    detail: results
      .filter((result) => result.ok === ok)
      .map((result) => result.detail)
      .join(" "),
  };
}

/** Whether reminders have anywhere to go. */
function hasDestination(db: Db): boolean {
  return readSettings(db).homeAssistant.reminderUrl !== "" || hasDevices(db);
}

function build(
  db: Db,
  config: Pick<Config, "timeZone">,
  kind: ReminderKind,
  settings: Settings,
  now: Date,
): Built | null {
  const today = localClock(now, config.timeZone).date;
  if (kind === "due_soon") return dueSoonReminder(db, today, settings.reminders.dueSoon.days);
  if (kind === "tithing") return tithingReminder(db, today, now);
  const reminder =
    kind === "digest" ? digestReminder(db, config, now) : streakReminder(db, config, now);
  return reminder ? { reminder, keys: [] } : null;
}

const SETTING: Record<Exclude<ReminderKind, "tithing">, keyof ReminderSettings> = {
  digest: "digest",
  due_soon: "dueSoon",
  streak: "streak",
};

/** Whether a reminder is on, and its time. */
function settingFor(settings: Settings, kind: ReminderKind): { enabled: boolean; time: string } {
  return kind === "tithing" ? settings.tithingReminder : settings.reminders[SETTING[kind]];
}

/** Reminders that apply: the tithing one only while Tithing is on. */
function kindsFor(settings: Settings): ReminderKind[] {
  return REMINDER_KINDS.filter((kind) => kind !== "tithing" || settings.modules.tithing);
}

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

export type ReminderOutcome = { kind: ReminderKind | "habit"; ok: boolean; detail: string };

/** Last failed try per reminder and day, so a Home Assistant outage isn't retried every minute. */
const lastTry = new Map<string, number>();

/** For tests: forget failed tries. */
export function resetReminderTries() {
  lastTry.clear();
}

/**
 * Sends each enabled reminder whose time has come today and that hasn't gone out
 * yet. Does nothing without a reminder webhook address or a device with notifications on.
 */
export async function runReminders(
  db: Db,
  config: Pick<Config, "timeZone">,
  now = new Date(),
): Promise<ReminderOutcome[]> {
  const settings = readSettings(db);
  if (!hasDestination(db)) return [];
  const clock = localClock(now, config.timeZone);
  const outcomes: ReminderOutcome[] = [];
  for (const kind of kindsFor(settings)) {
    const setting = settingFor(settings, kind);
    if (!setting.enabled || !inWindow(setting.time, clock.minutes)) continue;
    if (sentToday(db, kind, clock.date)) continue;
    const tryKey = dayKey(kind, clock.date);
    if (now.getTime() - (lastTry.get(tryKey) ?? 0) < RETRY_MS) continue;
    const built = build(db, config, kind, settings, now);
    if (!built) continue;
    const delivery = await deliver(db, config, kind, built, now);
    if (delivery.ok) {
      record(db, kind, clock.date, built, now);
      lastTry.delete(tryKey);
      log.info("Reminder sent", { kind });
    } else {
      lastTry.set(tryKey, now.getTime());
    }
    outcomes.push({ kind, ok: delivery.ok, detail: delivery.detail });
  }
  if (settings.modules.habits) outcomes.push(...(await runHabitReminders(db, config, now)));
  return outcomes;
}

/**
 * Each habit's own reminder, at its time, once a day, while it's meant for today and
 * not yet done. Tried again like the others when it doesn't go through.
 */
async function runHabitReminders(
  db: Db,
  config: Pick<Config, "timeZone">,
  now: Date,
): Promise<ReminderOutcome[]> {
  const clock = localClock(now, config.timeZone);
  const outcomes: ReminderOutcome[] = [];
  for (const habit of habitsToRemind(db, { now, timeZone: config.timeZone })) {
    if (!habit.remindAt || !inWindow(habit.remindAt, clock.minutes)) continue;
    const key = `habit:${habit.id}:${clock.date}`;
    const sent = db
      .select({ id: reminderSends.id })
      .from(reminderSends)
      .where(eq(reminderSends.key, key))
      .get();
    if (sent) continue;
    if (now.getTime() - (lastTry.get(key) ?? 0) < RETRY_MS) continue;
    const reminder: Reminder = {
      kind: "habit",
      title: `Time for ${habit.name}`,
      message:
        habit.schedule.kind === "weekly"
          ? `${habit.weekCount} of ${habit.weekTarget} this week so far.`
          : "Not checked off yet today.",
    };
    const delivery = await deliver(
      db,
      config,
      "habit",
      { reminder, keys: [String(habit.id)] },
      now,
    );
    if (delivery.ok) {
      db.insert(reminderSends)
        .values({
          kind: "habit",
          key,
          title: reminder.title,
          message: reminder.message,
          sentAt: now,
        })
        .onConflictDoNothing()
        .run();
      lastTry.delete(key);
      log.info("Reminder sent", { kind: "habit" });
    } else {
      lastTry.set(key, now.getTime());
    }
    outcomes.push({ kind: "habit", ok: delivery.ok, detail: delivery.detail });
  }
  return outcomes;
}

/** Sends one reminder now, whatever the time, and counts it as today's. */
export async function sendReminderNow(
  db: Db,
  config: Pick<Config, "timeZone">,
  kind: ReminderKind,
  now = new Date(),
): Promise<{ built: Built | null; delivery: Delivered | null }> {
  const settings = readSettings(db);
  const built = build(db, config, kind, settings, now);
  if (!built) return { built: null, delivery: null };
  const delivery = await deliver(db, config, kind, built, now);
  if (delivery.ok) record(db, kind, localClock(now, config.timeZone).date, built, now);
  return { built, delivery };
}

/** Whether reminders have a webhook or a device to go to. */
export function remindersConfigured(db: Db): boolean {
  return hasDestination(db);
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
  return kindsFor(settings).map((kind) => ({
    kind,
    reminder: build(db, config, kind, settings, now)?.reminder ?? null,
    sentToday: sentToday(db, kind, today),
  }));
}

/** The latest reminders sent, newest first. */
export function recentReminders(db: Queryable, limit = 10) {
  return (
    db
      .select({
        kind: reminderSends.kind,
        title: reminderSends.title,
        message: reminderSends.message,
        sentAt: reminderSends.sentAt,
      })
      .from(reminderSends)
      // One row per reminder: not the extra keys for each item or income it named.
      .where(
        and(notLike(reminderSends.key, "due:%"), notLike(reminderSends.key, "tithing-income:%")),
      )
      .orderBy(desc(reminderSends.sentAt), desc(reminderSends.id))
      .limit(limit)
      .all()
      .map((row) => ({ ...row, sentAt: row.sentAt.toISOString() }))
  );
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
