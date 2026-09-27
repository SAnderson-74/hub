import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { Db, Queryable } from "../../server/db/client";
import { badRequest, notFound } from "../../server/errors";
import type { RuleCreate, RuleUpdate } from "../../shared/books";
import { matchRule, type RuleDirection } from "../../shared/moneyRules";
import { requireBook, requireCategory } from "./money.service";
import { moneyAccounts, moneyCategories, moneyRules, moneyTransactions } from "./schema";

type RuleRow = typeof moneyRules.$inferSelect;

export type RuleJson = {
  id: number;
  bookId: number;
  contains: string;
  direction: RuleDirection;
  categoryId: number;
  category: { id: number; name: string };
  renameTo: string;
};

/** A book's rules in the order they're tried. */
export function listRules(db: Queryable, bookId: number): RuleJson[] {
  requireBook(db, bookId);
  return db
    .select({ rule: moneyRules, categoryName: moneyCategories.name })
    .from(moneyRules)
    .innerJoin(moneyCategories, eq(moneyCategories.id, moneyRules.categoryId))
    .where(eq(moneyRules.bookId, bookId))
    .orderBy(asc(moneyRules.sortOrder), asc(moneyRules.id))
    .all()
    .map(({ rule, categoryName }) => ({
      id: rule.id,
      bookId: rule.bookId,
      contains: rule.contains,
      direction: rule.direction,
      categoryId: rule.categoryId,
      category: { id: rule.categoryId, name: categoryName },
      renameTo: rule.renameTo,
    }));
}

function requireRule(db: Queryable, id: number): RuleRow {
  const row = db.select().from(moneyRules).where(eq(moneyRules.id, id)).get();
  if (!row) throw notFound("That rule doesn't exist. It may have been deleted.");
  return row;
}

function checkCategoryInBook(db: Queryable, bookId: number, categoryId: number) {
  if (requireCategory(db, categoryId, "body").bookId !== bookId) {
    throw badRequest("That category belongs to another book. Pick one from this book.");
  }
}

export function createRule(db: Db, input: RuleCreate): RuleJson[] {
  return db.transaction((tx) => {
    requireBook(tx, input.bookId, "body");
    checkCategoryInBook(tx, input.bookId, input.categoryId);
    const last = tx
      .select({ last: sql<number | null>`max(${moneyRules.sortOrder})` })
      .from(moneyRules)
      .where(eq(moneyRules.bookId, input.bookId))
      .get();
    tx.insert(moneyRules)
      .values({
        bookId: input.bookId,
        contains: input.contains,
        direction: input.direction ?? "any",
        categoryId: input.categoryId,
        renameTo: input.renameTo ?? "",
        sortOrder: (last?.last ?? 0) + 1,
      })
      .run();
    return listRules(tx, input.bookId);
  });
}

export function updateRule(db: Db, id: number, patch: RuleUpdate): RuleJson[] {
  return db.transaction((tx) => {
    const rule = requireRule(tx, id);
    if (patch.categoryId !== undefined) checkCategoryInBook(tx, rule.bookId, patch.categoryId);
    tx.update(moneyRules)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(moneyRules.id, id))
      .run();
    return listRules(tx, rule.bookId);
  });
}

/** Swaps a rule with its neighbor, since the first rule that fits wins. */
export function moveRule(db: Db, id: number, to: "earlier" | "later"): RuleJson[] {
  return db.transaction((tx) => {
    const rule = requireRule(tx, id);
    const order = tx
      .select({ id: moneyRules.id, sortOrder: moneyRules.sortOrder })
      .from(moneyRules)
      .where(eq(moneyRules.bookId, rule.bookId))
      .orderBy(asc(moneyRules.sortOrder), asc(moneyRules.id))
      .all();
    const index = order.findIndex((row) => row.id === id);
    const other = order[to === "earlier" ? index - 1 : index + 1];
    if (other) {
      // Renumber so equal sort orders can't make the swap a no-op.
      const next = order.map((row) => row.id);
      next[index] = other.id;
      next[order.indexOf(other)] = id;
      next.forEach((ruleId, position) => {
        tx.update(moneyRules)
          .set({ sortOrder: position + 1 })
          .where(eq(moneyRules.id, ruleId))
          .run();
      });
    }
    return listRules(tx, rule.bookId);
  });
}

export function deleteRule(db: Db, id: number): RuleJson[] {
  return db.transaction((tx) => {
    const rule = requireRule(tx, id);
    tx.delete(moneyRules).where(eq(moneyRules.id, id)).run();
    return listRules(tx, rule.bookId);
  });
}

/** The rules as matchRule takes them, for applying in a transaction. */
export function rulesForBook(db: Queryable, bookId: number) {
  return db
    .select()
    .from(moneyRules)
    .where(eq(moneyRules.bookId, bookId))
    .orderBy(asc(moneyRules.sortOrder), asc(moneyRules.id))
    .all();
}

/**
 * Categorizes a book's uncategorized transactions (transfers aside) with its rules,
 * renaming payees where a rule says to. Transactions no rule fits stay as they are.
 */
export function applyRules(db: Db, bookId: number): { categorized: number } {
  return db.transaction((tx) => {
    requireBook(tx, bookId);
    const rules = rulesForBook(tx, bookId);
    if (rules.length === 0) return { categorized: 0 };
    const rows = tx
      .select({ transaction: moneyTransactions })
      .from(moneyTransactions)
      .innerJoin(moneyAccounts, eq(moneyAccounts.id, moneyTransactions.accountId))
      .where(
        and(
          eq(moneyAccounts.bookId, bookId),
          isNull(moneyTransactions.categoryId),
          isNull(moneyTransactions.transferPeerId),
        ),
      )
      .all()
      .map((row) => row.transaction);
    let categorized = 0;
    const now = new Date();
    for (const row of rows) {
      const rule = matchRule(rules, row);
      if (!rule) continue;
      tx.update(moneyTransactions)
        .set({
          categoryId: rule.categoryId,
          payee: rule.renameTo || row.payee,
          updatedAt: now,
        })
        .where(eq(moneyTransactions.id, row.id))
        .run();
      categorized += 1;
    }
    return { categorized };
  });
}
