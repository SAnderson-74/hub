import { and, asc, eq, gte, inArray, isNull, lt, lte, sql } from "drizzle-orm";
import type { Db, Queryable } from "../../server/db/client";
import { badRequest } from "../../server/errors";
import {
  type BudgetMonthTotals,
  type BudgetSet,
  budgetFor,
  monthBounds,
  shiftMonth,
} from "../../shared/budget";
import { requireBook, requireCategory } from "./money.service";
import { moneyAccounts, moneyBudgets, moneyCategories, moneyTransactions } from "./schema";

const HISTORY_MONTHS = 6;

export type BudgetCategoryJson = {
  id: number;
  name: string;
  archived: boolean;
  /** The budget in force this month, or null for none. */
  budgetCents: number | null;
  /** Spending this month; refunds count against it, so it can be negative. */
  spentCents: number;
};

export type BudgetMonthJson = {
  month: string;
  /** Spending categories: active ones, plus archived ones with a budget or spending. */
  categories: BudgetCategoryJson[];
  totals: {
    budgetedCents: number;
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

  const months = Array.from({ length: HISTORY_MONTHS }, (_, index) =>
    shiftMonth(month, index - (HISTORY_MONTHS - 1)),
  );
  const from = monthBounds(months[0] ?? month).from;
  const to = monthBounds(month).to;
  const monthExpr = sql<string>`substr(${moneyTransactions.date}, 1, 7)`;
  const sums = db
    .select({
      categoryId: moneyTransactions.categoryId,
      month: monthExpr,
      total: sql<number>`sum(${moneyTransactions.amountCents})`,
    })
    .from(moneyTransactions)
    .innerJoin(moneyAccounts, eq(moneyAccounts.id, moneyTransactions.accountId))
    .where(
      and(
        eq(moneyAccounts.bookId, bookId),
        gte(moneyTransactions.date, from),
        lte(moneyTransactions.date, to),
      ),
    )
    .groupBy(moneyTransactions.categoryId, monthExpr)
    .all();
  const total = (categoryId: number, inMonth: string) =>
    sums.find((row) => row.categoryId === categoryId && row.month === inMonth)?.total ?? 0;

  const expense = categories.filter((category) => category.kind === "expense");
  const rows = expense
    .map((category) => ({
      id: category.id,
      name: category.name,
      archived: category.archived,
      budgetCents: budgetFor(entries, category.id, month),
      // Spending is money out, so it's the negated sum; a refund lowers it.
      spentCents: -total(category.id, month),
    }))
    .filter((row) => !row.archived || row.budgetCents !== null || row.spentCents !== 0)
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

  const budgeted = rows.filter((row) => row.budgetCents !== null);
  return {
    month,
    categories: rows,
    totals: {
      budgetedCents: budgeted.reduce((sum, row) => sum + (row.budgetCents ?? 0), 0),
      spentBudgetedCents: budgeted.reduce((sum, row) => sum + row.spentCents, 0),
      spentUnbudgetedCents: rows
        .filter((row) => row.budgetCents === null)
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
