import { and, eq, gt, isNotNull, isNull, lte, ne, or } from "drizzle-orm";
import type { Config } from "../../server/config";
import { localDateParts } from "../../server/db/backup";
import type { Db, Queryable } from "../../server/db/client";
import { log } from "../../server/log";
import { OPEN_LEAD_STATUSES } from "../../shared/business";
import type { Reminder } from "../../shared/homeAssistant";
import { addDays } from "../../shared/recurrence";
import { streakState, streakSummary } from "../../shared/streak";
import { businessLeads, businessSteps } from "../business/schema";
import { readSettings } from "../core/settings.service";
import { studyStreak } from "../education/streak.service";
import { goals, milestones } from "../goals/schema";
import { tasks } from "../tasks/schema";

/** How far ahead "upcoming" looks, and how many it lists. */
const UPCOMING_DAYS = 14;
const UPCOMING_LIMIT = 10;
/** Task titles listed for today. */
const TODAY_TITLES = 5;
const SEND_TIMEOUT_MS = 10_000;

export type UpcomingDate = {
  date: string;
  kind: "task" | "milestone" | "goal" | "business_step" | "lead";
  title: string;
};

/** What Home Assistant receives. Its templates read these fields from trigger.json. */
export type SummaryPayload = {
  type: "hub_summary";
  sent_at: string;
  date: string;
  /** One line for a notification or a dashboard card. */
  message: string;
  study_streak: {
    days: number;
    longest: number;
    state: "met" | "at_risk" | "none";
    today_minutes: number;
    minimum_minutes: number;
    summary: string;
  };
  tasks_today: {
    open: number;
    overdue: number;
    done: number;
    summary: string;
    titles: string[];
  };
  upcoming: UpcomingDate[];
};

/** Plain string order: localeCompare would sort "~" (no date) before digits. */
const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const NO_DATE = "~";

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

function todayTasks(db: Queryable, today: string, timeZone: string) {
  const rows = db
    .select({
      title: tasks.title,
      status: tasks.status,
      dueDate: tasks.dueDate,
      priority: tasks.priority,
      completedAt: tasks.completedAt,
    })
    .from(tasks)
    .all();
  const open = rows
    .filter(
      (task) =>
        task.status !== "done" &&
        ((task.dueDate !== null && task.dueDate <= today) || task.status === "doing"),
    )
    // Overdue first, then due today, then in-progress tasks without a date.
    .sort((a, b) => byText(a.dueDate ?? NO_DATE, b.dueDate ?? NO_DATE) || b.priority - a.priority);
  const overdue = open.filter((task) => task.dueDate !== null && task.dueDate < today).length;
  const done = rows.filter(
    (task) =>
      task.status === "done" &&
      task.completedAt !== null &&
      localDateParts(task.completedAt, timeZone).date === today,
  ).length;
  const parts = [
    open.length === 0 ? "Nothing due today" : `${plural(open.length, "task", "tasks")} for today`,
    overdue > 0 ? `${overdue} overdue` : "",
    done > 0 ? `${done} done` : "",
  ].filter(Boolean);
  return {
    open: open.length,
    overdue,
    done,
    summary: `${parts.join(", ")}.`,
    titles: open.slice(0, TODAY_TITLES).map((task) => task.title),
  };
}

/** Dated things from tomorrow through two weeks out, soonest first. */
function upcomingDates(db: Queryable, today: string): UpcomingDate[] {
  const from = addDays(today, 1);
  const to = addDays(today, UPCOMING_DAYS);
  const within = (date: string | null): date is string =>
    date !== null && date >= from && date <= to;
  const found: UpcomingDate[] = [];

  for (const task of db
    .select({ title: tasks.title, date: tasks.dueDate })
    .from(tasks)
    .where(and(ne(tasks.status, "done"), isNotNull(tasks.dueDate), gt(tasks.dueDate, today)))
    .all()) {
    if (within(task.date)) found.push({ date: task.date, kind: "task", title: task.title });
  }
  const activeGoals = db
    .select({ id: goals.id, title: goals.title, date: goals.targetDate })
    .from(goals)
    .where(eq(goals.status, "active"))
    .all();
  for (const goal of activeGoals) {
    if (within(goal.date)) found.push({ date: goal.date, kind: "goal", title: goal.title });
  }
  const goalTitles = new Map(activeGoals.map((goal) => [goal.id, goal.title]));
  for (const milestone of db
    .select({ goalId: milestones.goalId, title: milestones.title, date: milestones.targetDate })
    .from(milestones)
    .where(isNull(milestones.doneAt))
    .all()) {
    const goal = goalTitles.get(milestone.goalId);
    if (goal !== undefined && within(milestone.date)) {
      found.push({
        date: milestone.date,
        kind: "milestone",
        title: `${milestone.title} (${goal})`,
      });
    }
  }
  for (const step of db
    .select({ title: businessSteps.title, date: businessSteps.dueOn })
    .from(businessSteps)
    .where(and(eq(businessSteps.done, false), lte(businessSteps.dueOn, to)))
    .all()) {
    if (within(step.date))
      found.push({ date: step.date, kind: "business_step", title: step.title });
  }
  for (const lead of db
    .select({
      name: businessLeads.name,
      nextStep: businessLeads.nextStep,
      date: businessLeads.nextStepOn,
      status: businessLeads.status,
    })
    .from(businessLeads)
    .where(or(...OPEN_LEAD_STATUSES.map((status) => eq(businessLeads.status, status))))
    .all()) {
    if (within(lead.date)) {
      found.push({
        date: lead.date,
        kind: "lead",
        title: lead.nextStep ? `${lead.nextStep}: ${lead.name}` : lead.name,
      });
    }
  }
  return found
    .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title))
    .slice(0, UPCOMING_LIMIT);
}

/** The summary as it is right now, in Hub's time zone. */
export function summaryPayload(
  db: Db,
  config: Pick<Config, "timeZone">,
  now = new Date(),
): SummaryPayload {
  const today = localDateParts(now, config.timeZone).date;
  const settings = readSettings(db);
  const streak = studyStreak(db, {
    now,
    timeZone: config.timeZone,
    minimum: settings.studyMinimumMinutes,
  });
  const tasksToday = todayTasks(db, today, config.timeZone);
  const upcoming = upcomingDates(db, today);
  const next = upcoming[0];
  const message = [
    tasksToday.summary,
    streak.current > 0 ? `Study streak ${plural(streak.current, "day", "days")}.` : "",
    next ? `Next: ${next.title} on ${next.date}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return {
    type: "hub_summary",
    sent_at: now.toISOString(),
    date: today,
    message,
    study_streak: {
      days: streak.current,
      longest: streak.longest,
      state: streakState(streak),
      today_minutes: streak.todayMinutes,
      minimum_minutes: streak.minimum,
      summary: streakSummary(streak),
    },
    tasks_today: tasksToday,
    upcoming,
  };
}

// Sending

export type Delivery = {
  at: string;
  ok: boolean;
  /** What happened, in words, for Settings. */
  detail: string;
};

/** The last attempt of each kind since Hub started. Not stored: it's only for Settings. */
const lastDelivery: { summary: Delivery | null; reminder: Delivery | null } = {
  summary: null,
  reminder: null,
};

export function deliveryStatus() {
  return { ...lastDelivery };
}

/** For tests: forget earlier attempts. */
export function resetDeliveryStatus() {
  lastDelivery.summary = null;
  lastDelivery.reminder = null;
}

/**
 * Posts JSON to a Home Assistant webhook. Never logs the address (its webhook ID is
 * a secret) or what was sent; only whether it worked.
 */
async function post(
  kind: "summary" | "reminder",
  url: string,
  body: unknown,
  now: Date,
): Promise<Delivery> {
  let delivery: Delivery;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    delivery = res.ok
      ? { at: now.toISOString(), ok: true, detail: `Sent. Home Assistant answered ${res.status}.` }
      : {
          at: now.toISOString(),
          ok: false,
          detail: `Home Assistant answered ${res.status}. Check the webhook address.`,
        };
    if (res.ok) log.info("Home Assistant webhook sent", { kind, status: res.status });
    else log.warn("Home Assistant webhook refused", { kind, status: res.status });
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    delivery = {
      at: now.toISOString(),
      ok: false,
      detail: timedOut
        ? "Home Assistant didn't answer within 10 seconds. Check that Hub can reach it."
        : "Couldn't reach Home Assistant. Check the address and that Hub can reach it.",
    };
    // The cause's code (like ECONNREFUSED) says why without naming the address.
    const cause =
      error instanceof Error ? (error.cause as { code?: unknown } | undefined) : undefined;
    log.warn("Home Assistant webhook failed", {
      kind,
      code: typeof cause?.code === "string" ? cause.code : timedOut ? "TIMEOUT" : "UNKNOWN",
    });
  }
  lastDelivery[kind] = delivery;
  return delivery;
}

/** Sends the summary now. null when no summary address is set. */
export async function sendSummary(
  db: Db,
  config: Pick<Config, "timeZone">,
  now = new Date(),
): Promise<Delivery | null> {
  const { summaryUrl } = readSettings(db).homeAssistant;
  if (!summaryUrl) return null;
  return post("summary", summaryUrl, summaryPayload(db, config, now), now);
}

/** Sends one reminder. null when no reminder address is set. */
export async function sendReminder(
  db: Db,
  reminder: Reminder,
  now = new Date(),
): Promise<Delivery | null> {
  const { reminderUrl } = readSettings(db).homeAssistant;
  if (!reminderUrl) return null;
  return post(
    "reminder",
    reminderUrl,
    { type: "hub_reminder", sent_at: now.toISOString(), ...reminder },
    now,
  );
}

/** Whether the summary is due: an address is set and the interval has passed. */
export function summaryDue(db: Db, now: Date): boolean {
  const { summaryUrl, summaryMinutes } = readSettings(db).homeAssistant;
  if (!summaryUrl) return false;
  const last = lastDelivery.summary;
  return last === null || now.getTime() - Date.parse(last.at) >= summaryMinutes * 60_000 - 5_000;
}

/**
 * Sends the summary on its interval. Checks every minute, so a changed interval or a
 * new address takes effect within a minute. Returns a function that stops it.
 */
export function startHomeAssistantScheduler(
  db: Db,
  config: Pick<Config, "timeZone">,
  intervalMs = 60_000,
): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    const now = new Date();
    if (!summaryDue(db, now)) return;
    running = true;
    try {
      await sendSummary(db, config, now);
    } finally {
      running = false;
    }
  };
  void tick();
  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
