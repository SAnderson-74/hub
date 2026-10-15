import { and, asc, eq, gte, inArray, isNull, lt, lte, sql } from "drizzle-orm";
import type { Db, Queryable } from "../../server/db/client";
import { badRequest } from "../../server/errors";
import {
  type BudgetMonthTotals,
  type BudgetSet,
  type BudgetSettingsSet,
  budgetFor,
  goalDueDate,
  monthBounds,
  neededMonthlyCents,
  shiftMonth,
} from "../../shared/budget";
import { lineAmountCents, lineCategoryId, splitJoin } from "./lines";
import { requireBook, requireCategory } from "./money.service";
import {
  moneyAccounts,
  moneyBudgetSettings,
  moneyBudgets,
  moneyCategories,
  moneyTransactionSplits,
  moneyTransactions,
} from "./schema";

const HISTORY_MONTHS = 6;

export type BudgetCategoryJson = {
  id: number;
  name: string;
  archived: boolean;
  /** The budget in force this month, or null for none. */
  budgetCents: number | null;
  /** Spending this month; refunds count against it, so it can be negative. */
  spentCents: number;
  /** Whether what's left carries into next month. */
  rollover: boolean;
  /** Left over from earlier months, when it carries over. Never negative. */
  carriedCents: number;
  /** What it may spend this month: its budget plus what carried over. Null for neither. */
  availableCents: number | null;
  /** A sinking fund: what it's saving up for, and what to set aside to get there. */
  goal: {
    cents: number;
    /** When the cost is next due, as seen from this month. */
    dueDate: string;
    everyMonths: 6 | 12 | null;
    /** What to budget each month from this one to have it in time. */
    neededMonthlyCents: number;
    /** Put by so far: what carried over plus this month's budget, less this month's spending. */
    savedCents: number;
  } | null;
};

export type BudgetMonthJson = {
  month: string;
  /** Spending categories: active ones, plus archived ones with a budget or spending. */
  categories: BudgetCategoryJson[];
  totals: {
    budgetedCents: number;
    /** Carried over from earlier months, in categories that carry over. */
    carriedCents: number;
    /** Spending in categories with a budget. */
    spentBudgetedCents: number;
    /** Spending in categories without one. */
    spentUnbudgetedCents: number;
    /** Money in to income categories. */
    incomeCents: number;
    /** Money out with no category (transfers aside). */
    uncategorizedCents: number;
  };
  /** The six months ending with this one, oldest first, for the chart. */
  history: BudgetMonthTotals[];
};

type SettingRow = typeof moneyBudgetSettings.$inferSelect;

/** A sinking fund as seen from `month`, or null when the category isn't saving up. */
function goalOf(
  setting: SettingRow,
  month: string,
  carriedCents: number,
  savedCents: number,
): BudgetCategoryJson["goal"] {
  if (setting.goalCents === null || !setting.goalDate) return null;
  const everyMonths =
    setting.goalEveryMonths === 6 || setting.goalEveryMonths === 12
      ? setting.goalEveryMonths
      : null;
  const dueDate = goalDueDate(setting.goalDate, everyMonths, month);
  return {
    cents: setting.goalCents,
    dueDate,
    everyMonths,
    neededMonthlyCents: neededMonthlyCents(setting.goalCents, carriedCents, month, dueDate),
    savedCents,
  };
}

/** A book's budget for a month: each spending category's budget and what was spent. */
export function budgetMonth(db: Queryable, bookId: number, month: string): BudgetMonthJson {
  requireBook(db, bookId);
  const categories = db
    .select()
    .from(moneyCategories)
    .where(eq(moneyCategories.bookId, bookId))
    .orderBy(asc(moneyCategories.sortOrder), asc(moneyCategories.id))
    .all();
  const ids = categories.map((category) => category.id);
  const entries =
    ids.length === 0
      ? []
      : db
          .select({
            categoryId: moneyBudgets.categoryId,
            month: moneyBudgets.month,
            amountCents: moneyBudgets.amountCents,
          })
          .from(moneyBudgets)
          .where(and(inArray(moneyBudgets.categoryId, ids), lte(moneyBudgets.month, month)))
          .all();

  const settings = new Map(
    (ids.length === 0
      ? []
      : db
          .select()
          .from(moneyBudgetSettings)
          .where(inArray(moneyBudgetSettings.categoryId, ids))
          .all()
    ).map((row) => [row.categoryId, row]),
  );

  const months = Array.from({ length: HISTORY_MONTHS }, (_, index) =>
    shiftMonth(month, index - (HISTORY_MONTHS - 1)),
  );
  // Carrying over counts from the month it was turned on, or the category's first
  // budget if that came later, so spending before either doesn't count.
  const carryStart = new Map<number, string>();
  for (const [categoryId, row] of settings) {
    if (!row.rollover) continue;
    const first = entries
      .filter((entry) => entry.categoryId === categoryId)
      .reduce<string | null>(
        (low, entry) => (low === null || entry.month < low ? entry.month : low),
        null,
      );
    const start = [row.rolloverFrom ?? month, first ?? month].sort().at(-1) ?? month;
    if (start < month) carryStart.set(categoryId, start);
  }
  const earliest = [months[0] ?? month, ...carryStart.values()].sort()[0] ?? month;
  const from = monthBounds(earliest).from;
  const to = monthBounds(month).to;
  const monthExpr = sql<string>`substr(${moneyTransactions.date}, 1, 7)`;
  // Split transactions count in each part's category.
  const sums = db
    .select({
      categoryId: lineCategoryId,
      month: monthExpr,
      total: sql<number>`sum(${lineAmountCents})`,
    })
    .from(moneyTransactions)
    .innerJoin(moneyAccounts, eq(moneyAccounts.id, moneyTransactions.accountId))
    .leftJoin(moneyTransactionSplits, splitJoin)
    .where(
      and(
        eq(moneyAccounts.bookId, bookId),
        gte(moneyTransactions.date, from),
        lte(moneyTransactions.date, to),
      ),
    )
    .groupBy(lineCategoryId, monthExpr)
    .all();
  const total = (categoryId: number, inMonth: string) =>
    sums.find((row) => row.categoryId === categoryId && row.month === inMonth)?.total ?? 0;

  /** What's left over from earlier months; overspending a month doesn't carry. */
  const carried = (categoryId: number) => {
    const start = carryStart.get(categoryId);
    let carry = 0;
    for (
      let inMonth = start;
      inMonth !== undefined && inMonth < month;
      inMonth = shiftMonth(inMonth, 1)
    ) {
      const available = (budgetFor(entries, categoryId, inMonth) ?? 0) + carry;
      carry = Math.max(0, available + total(categoryId, inMonth));
    }
    return carry;
  };

  const expense = categories.filter((category) => category.kind === "expense");
  const rows = expense
    .map((category): BudgetCategoryJson => {
      const budgetCents = budgetFor(entries, category.id, month);
      // Spending is money out, so it's the negated sum; a refund lowers it.
      const spentCents = -total(category.id, month);
      const setting = settings.get(category.id);
      const rollover = setting?.rollover === true;
      const carriedCents = rollover ? carried(category.id) : 0;
      const availableCents =
        budgetCents === null && carriedCents === 0 ? null : (budgetCents ?? 0) + carriedCents;
      const goal = setting
        ? goalOf(setting, month, carriedCents, Math.max(0, (availableCents ?? 0) - spentCents))
        : null;
      return {
        id: category.id,
        name: category.name,
        archived: category.archived,
        budgetCents,
        spentCents,
        rollover,
        carriedCents,
        availableCents,
        goal,
      };
    })
    .filter((row) => !row.archived || row.availableCents !== null || row.spentCents !== 0)
    .sort((a, b) => Number(a.archived) - Number(b.archived));

  const { from: monthStart } = monthBounds(month);
  const uncategorized = db
    .select({ total: sql<number | null>`sum(${moneyTransactions.amountCents})` })
    .from(moneyTransactions)
    .innerJoin(moneyAccounts, eq(moneyAccounts.id, moneyTransactions.accountId))
    .where(
      and(
        eq(moneyAccounts.bookId, bookId),
        isNull(moneyTransactions.categoryId),
        isNull(moneyTransactions.transferPeerId),
        lt(moneyTransactions.amountCents, 0),
        gte(moneyTransactions.date, monthStart),
        lte(moneyTransactions.date, to),
      ),
    )
    .get();

  // Money left over from earlier months counts like a budget.
  const budgeted = rows.filter((row) => row.availableCents !== null);
  return {
    month,
    categories: rows,
    totals: {
      budgetedCents: budgeted.reduce((sum, row) => sum + (row.budgetCents ?? 0), 0),
      carriedCents: budgeted.reduce((sum, row) => sum + row.carriedCents, 0),
      spentBudgetedCents: budgeted.reduce((sum, row) => sum + row.spentCents, 0),
      spentUnbudgetedCents: rows
        .filter((row) => row.availableCents === null)
        .reduce((sum, row) => sum + row.spentCents, 0),
      incomeCents: categories
        .filter((category) => category.kind === "income")
        .reduce((sum, category) => sum + total(category.id, month), 0),
      uncategorizedCents: -(uncategorized?.total ?? 0),
    },
    history: months.map((inMonth) => ({
      month: inMonth,
      budgetedCents: expense.reduce(
        (sum, category) => sum + (budgetFor(entries, category.id, inMonth) ?? 0),
        0,
      ),
      spentCents: expense.reduce((sum, category) => sum - total(category.id, inMonth), 0),
    })),
  };
}

/**
 * Sets a spending category's budget from a month on. It stays until a later month
 * sets another amount; 0 ends it. Answers with that month's budget.
 */
export function setBudget(db: Db, input: BudgetSet): BudgetMonthJson {
  return db.transaction((tx) => {
    const category = requireCategory(tx, input.categoryId, "body");
    if (category.kind !== "expense") {
      throw badRequest("Budgets are for spending categories. Pick a spending category.");
    }
    tx.insert(moneyBudgets)
      .values({ categoryId: category.id, month: input.month, amountCents: input.amountCents })
      .onConflictDoUpdate({
        target: [moneyBudgets.categoryId, moneyBudgets.month],
        set: { amountCents: input.amountCents, updatedAt: new Date() },
      })
      .run();
    return budgetMonth(tx, category.bookId, input.month);
  });
}

/**
 * Sets whether a spending category carries what's left into the next month, and what
 * it's saving up for. A goal needs carrying over, so it turns that on. Answers with
 * that month's budget.
 */
export function setBudgetSettings(db: Db, input: BudgetSettingsSet): BudgetMonthJson {
  return db.transaction((tx) => {
    const category = requireCategory(tx, input.categoryId, "body");
    if (category.kind !== "expense") {
      throw badRequest("Budgets are for spending categories. Pick a spending category.");
    }
    const current = tx
      .select()
      .from(moneyBudgetSettings)
      .where(eq(moneyBudgetSettings.categoryId, category.id))
      .get();
    const rollover = input.rollover || input.goal !== null;
    // Turning it on starts carrying from this month; staying on keeps the start.
    const rolloverFrom = rollover
      ? current?.rollover && current.rolloverFrom
        ? current.rolloverFrom
        : input.month
      : null;
    const values = {
      rollover,
      rolloverFrom,
      goalCents: input.goal?.cents ?? null,
      goalDate: input.goal?.dueDate ?? null,
      goalEveryMonths: input.goal?.everyMonths ?? null,
    };
    if (!rollover && input.goal === null) {
      tx.delete(moneyBudgetSettings).where(eq(moneyBudgetSettings.categoryId, category.id)).run();
    } else {
      tx.insert(moneyBudgetSettings)
        .values({ categoryId: category.id, ...values })
        .onConflictDoUpdate({
          target: moneyBudgetSettings.categoryId,
          set: { ...values, updatedAt: new Date() },
        })
        .run();
    }
    return budgetMonth(tx, category.bookId, input.month);
  });
}
