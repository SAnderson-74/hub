import { and, count, eq, gte, inArray, isNull, lt, lte, ne, or, sql, sum } from "drizzle-orm";
import type { Db, Queryable } from "../../server/db/client";
import { OPEN_LEAD_STATUSES } from "../../shared/business";
import { weekOf } from "../../shared/habits";
import type { ModuleId } from "../../shared/modules";
import type { ReviewStepId, ReviewStepKind } from "../../shared/planner";
import { addDays } from "../../shared/recurrence";
import { inventoryAging } from "../../shared/resaleAging";
import { formatMinutes } from "../../shared/time";
import { businessLeads } from "../business/schema";
import { readSettings } from "../core/settings.service";
import { assessments } from "../education/schema";
import { goalCheckins, goals } from "../goals/schema";
import { datedItems } from "../integrations/reminders.service";
import { billOccurrences } from "../money/bills.service";
import { moneyAccounts, moneyBooks, moneyTransactions } from "../money/schema";
import { listItems } from "../resale/resale.service";
import { resaleItems } from "../resale/schema";
import { tasks } from "../tasks/schema";
import { timeEntries } from "../time/schema";
import { weeklyReviews } from "./schema";

export type ReviewStep = {
  id: ReviewStepId;
  module: ModuleId;
  kind: ReviewStepKind;
  title: string;
  /** What's there, in a sentence. */
  summary: string;
  /** How many things need a look, or null for a step that's only a look. */
  count: number | null;
  href: string;
  /** The link's words, like "Open overdue tasks". */
  linkLabel: string;
  /** Ticked off, or (for a "fix" step) nothing left to fix. */
  done: boolean;
};

export type ReviewJson = {
  /** The Monday this week starts on. */
  week: string;
  steps: ReviewStep[];
  finishedAt: string | null;
  /** The last finished review before this week, if any. */
  lastFinished: string | null;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

type Draft = Omit<ReviewStep, "done">;

/** Each module's steps, from what's in the database now. */
function draftSteps(db: Queryable, today: string, now: Date): Draft[] {
  const steps: Draft[] = [];
  const open = ne(tasks.status, "done");

  // Tasks
  const overdue = scalar(
    db
      .select({ n: count() })
      .from(tasks)
      .where(and(open, lt(tasks.dueDate, today)))
      .get(),
  );
  steps.push({
    id: "overdue",
    module: "tasks",
    kind: "fix",
    title: "Deal with overdue tasks",
    summary:
      overdue === 0
        ? "Nothing is overdue."
        : `${plural(overdue, "task")} past due. Do, move, or drop each one.`,
    count: overdue,
    href: "/tasks?list=today",
    linkLabel: "Open Today",
  });
  const inbox = scalar(
    db
      .select({ n: count() })
      .from(tasks)
      .where(and(open, isNull(tasks.projectId), isNull(tasks.parentId), eq(tasks.someday, false)))
      .get(),
  );
  steps.push({
    id: "inbox",
    module: "tasks",
    kind: "look",
    title: "Sort the inbox",
    summary:
      inbox === 0
        ? "The inbox is empty."
        : `${plural(inbox, "task")} without a project. Give each a project, a date, or Someday.`,
    count: inbox,
    href: "/tasks?project=inbox",
    linkLabel: "Open the inbox",
  });
  const someday = scalar(
    db
      .select({ n: count() })
      .from(tasks)
      .where(and(open, eq(tasks.someday, true)))
      .get(),
  );
  steps.push({
    id: "someday",
    module: "tasks",
    kind: "look",
    title: "Look over Someday",
    summary:
      someday === 0
        ? "Nothing is parked in Someday."
        : `${plural(someday, "task")} parked. Bring back any that are ready.`,
    count: someday,
    href: "/tasks?list=someday",
    linkLabel: "Open Someday",
  });

  // The week ahead, across every module that's on.
  const ahead = datedItems(db, addDays(today, 1), addDays(today, 7)).length;
  steps.push({
    id: "week-ahead",
    module: "tasks",
    kind: "look",
    title: "Look at the week ahead",
    summary:
      ahead === 0
        ? "Nothing is dated in the next 7 days."
        : `${plural(ahead, "dated thing")} in the next 7 days.`,
    count: ahead,
    href: "/calendar",
    linkLabel: "Open the calendar",
  });

  // Goals: active ones with no check-in this past week.
  const active = db
    .select({ id: goals.id })
    .from(goals)
    .where(eq(goals.status, "active"))
    .all()
    .map((goal) => goal.id);
  const checkedIn = new Set(
    active.length === 0
      ? []
      : db
          .select({ goalId: goalCheckins.goalId })
          .from(goalCheckins)
          .where(
            and(inArray(goalCheckins.goalId, active), gte(goalCheckins.date, addDays(today, -6))),
          )
          .all()
          .map((row) => row.goalId),
  );
  const unchecked = active.filter((id) => !checkedIn.has(id)).length;
  steps.push({
    id: "goals",
    module: "goals",
    kind: "fix",
    title: "Check in on goals",
    summary:
      unchecked === 0
        ? active.length === 0
          ? "No active goals."
          : "Every active goal has a check-in this week."
        : `${plural(unchecked, "active goal")} without a check-in this week.`,
    count: unchecked,
    href: "/goals",
    linkLabel: "Open goals",
  });

  // Courses: assessments due in the next two weeks.
  const due = scalar(
    db
      .select({ n: count() })
      .from(assessments)
      .where(
        and(
          isNull(assessments.doneAt),
          gte(assessments.dueOn, today),
          lte(assessments.dueOn, addDays(today, 14)),
        ),
      )
      .get(),
  );
  steps.push({
    id: "assessments",
    module: "courses",
    kind: "look",
    title: "Plan for assessments",
    summary:
      due === 0
        ? "No assessments due in the next 2 weeks."
        : `${plural(due, "assessment")} due in the next 2 weeks. Block out time for them.`,
    count: due,
    href: "/courses",
    linkLabel: "Open courses",
  });

  // Resale: imports to finish, and stock that has sat.
  const toReview = scalar(
    db.select({ n: count() }).from(resaleItems).where(eq(resaleItems.needsReview, true)).get(),
  );
  steps.push({
    id: "resale-review",
    module: "resale",
    kind: "fix",
    title: "Finish imported items",
    summary:
      toReview === 0
        ? "No imported items need a look."
        : `${plural(toReview, "item")} imported with missing details.`,
    count: toReview,
    href: "/resale",
    linkLabel: "Open resale",
  });
  const stale = inventoryAging(
    listItems(db, { status: ["acquired", "repairing", "listed"] }),
    today,
  ).suggestions.length;
  steps.push({
    id: "resale-aging",
    module: "resale",
    kind: "look",
    title: "Move stock that has sat",
    summary:
      stale === 0
        ? "Nothing in stock has sat long."
        : `${plural(stale, "suggestion")} to list, reprice, or relist.`,
    count: stale,
    href: "/resale?do=resale-aging",
    linkLabel: "Open aging",
  });

  // Money: uncategorized transactions (in the book with the most), and bills this week.
  const byBook = db
    .select({ bookId: moneyAccounts.bookId, n: count() })
    .from(moneyTransactions)
    .innerJoin(moneyAccounts, eq(moneyAccounts.id, moneyTransactions.accountId))
    .innerJoin(moneyBooks, eq(moneyBooks.id, moneyAccounts.bookId))
    .where(
      and(
        isNull(moneyTransactions.categoryId),
        isNull(moneyTransactions.transferPeerId),
        eq(moneyBooks.archived, false),
      ),
    )
    .groupBy(moneyAccounts.bookId)
    .all()
    .sort((a, b) => b.n - a.n || a.bookId - b.bookId);
  const uncategorized = byBook.reduce((total, row) => total + row.n, 0);
  steps.push({
    id: "uncategorized",
    module: "money",
    kind: "fix",
    title: "Categorize transactions",
    summary:
      uncategorized === 0
        ? "Every transaction has a category."
        : `${plural(uncategorized, "transaction")} without a category.`,
    count: uncategorized,
    href: byBook[0] ? `/money?book=${byBook[0].bookId}&do=sort` : "/money",
    linkLabel: "Sort transactions",
  });
  const bills = billOccurrences(db, today, addDays(today, 7)).filter(
    (bill) => bill.kind !== "income",
  );
  steps.push({
    id: "bills",
    module: "money",
    kind: "look",
    title: "Check bills due this week",
    summary:
      bills.length === 0
        ? "No bills due in the next 7 days."
        : `${plural(bills.length, "bill")} due in the next 7 days. Make sure the money is there.`,
    count: bills.length,
    href: "/money?do=bills",
    linkLabel: "Open bills",
  });

  // Business: leads whose next step is due.
  const leads = scalar(
    db
      .select({ n: count() })
      .from(businessLeads)
      .where(
        and(
          or(...OPEN_LEAD_STATUSES.map((status) => eq(businessLeads.status, status))),
          lte(businessLeads.nextStepOn, today),
        ),
      )
      .get(),
  );
  steps.push({
    id: "leads",
    module: "business",
    kind: "fix",
    title: "Follow up with leads",
    summary:
      leads === 0
        ? "No lead follow-ups are due."
        : `${plural(leads, "lead")} with a follow-up due.`,
    count: leads,
    href: "/business?do=leads",
    linkLabel: "Open leads",
  });

  // Time: the last 7 days, to compare with what was planned.
  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const minutes = Number(
    db
      .select({ total: sum(timeEntries.minutes) })
      .from(timeEntries)
      .where(and(gte(timeEntries.startedAt, since), sql`${timeEntries.minutes} is not null`))
      .get()?.total ?? 0,
  );
  steps.push({
    id: "time",
    module: "time",
    kind: "look",
    title: "Look back at your time",
    summary:
      minutes === 0
        ? "No time logged in the last 7 days."
        : `${formatMinutes(minutes)} logged in the last 7 days.`,
    count: null,
    href: "/time",
    linkLabel: "Open time",
  });

  return steps;
}

const scalar = (row: { n: number } | undefined) => row?.n ?? 0;

/** This week's review: each step for the modules that are on, and what's ticked off. */
export function getReview(db: Queryable, today: string, now = new Date()): ReviewJson {
  const week = weekOf(today);
  const row = db.select().from(weeklyReviews).where(eq(weeklyReviews.week, week)).get();
  const ticked = new Set(row?.done ?? []);
  const modules = readSettings(db).modules;
  const steps = draftSteps(db, today, now)
    .filter((step) => modules[step.module])
    .map((step) => ({
      ...step,
      done: ticked.has(step.id) || (step.kind === "fix" && step.count === 0),
    }));
  const last = db
    .select({ week: weeklyReviews.week })
    .from(weeklyReviews)
    .where(and(lt(weeklyReviews.week, week), sql`${weeklyReviews.finishedAt} is not null`))
    .orderBy(sql`${weeklyReviews.week} desc`)
    .limit(1)
    .get();
  return {
    week,
    steps,
    finishedAt: row?.finishedAt?.toISOString() ?? null,
    lastFinished: last?.week ?? null,
  };
}

/** Saves this week's row, creating it on the first change. */
function saveWeek(
  db: Db,
  week: string,
  change: (row: { done: ReviewStepId[]; finishedAt: Date | null }) => {
    done: ReviewStepId[];
    finishedAt: Date | null;
  },
) {
  db.transaction((tx) => {
    const row = tx.select().from(weeklyReviews).where(eq(weeklyReviews.week, week)).get();
    const next = change({ done: row?.done ?? [], finishedAt: row?.finishedAt ?? null });
    const now = new Date();
    tx.insert(weeklyReviews)
      .values({ week, ...next, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({ target: weeklyReviews.week, set: { ...next, updatedAt: now } })
      .run();
  });
}

export function tickStep(db: Db, today: string, step: ReviewStepId, done: boolean): ReviewJson {
  saveWeek(db, weekOf(today), (row) => ({
    ...row,
    done: done ? [...new Set([...row.done, step])] : row.done.filter((value) => value !== step),
  }));
  return getReview(db, today);
}

export function finishReview(db: Db, today: string, finished: boolean): ReviewJson {
  saveWeek(db, weekOf(today), (row) => ({ ...row, finishedAt: finished ? new Date() : null }));
  return getReview(db, today);
}
