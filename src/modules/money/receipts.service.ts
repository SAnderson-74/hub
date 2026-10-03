import { and, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import type { Queryable } from "../../server/db/client";
import { badRequest, notFound } from "../../server/errors";
import {
  categoryKey,
  type ReadReceipt,
  type ReceiptImportInput,
  readReceipts,
  receiptImportSchema,
  receiptParts,
} from "../../shared/receipts";
import { addDays } from "../../shared/recurrence";
import { splitsOf } from "./lines";
import {
  createTransaction,
  deleteTransaction,
  requireBook,
  requireTransaction,
  updateTransaction,
} from "./money.service";
import { DAYS_AFTER, DAYS_BEFORE } from "./receiptLinks";
import {
  moneyAccounts,
  moneyCards,
  moneyCategories,
  moneyReceipts,
  moneyTransactions,
  type ReceiptBefore,
} from "./schema";

export type ReceiptOutcome = "match" | "create" | "duplicate" | "skip" | "blocked";

export type ReceiptPreviewJson = {
  index: number;
  store: string;
  date: string | null;
  totalCents: number | null;
  type: "purchase" | "return";
  /** match: added to an existing transaction; create: a new one; duplicate: imported before. */
  outcome: ReceiptOutcome;
  problems: string[];
  account: { id: number; name: string } | null;
  card: { id: number; name: string; last4: string | null } | null;
  match: { id: number; date: string; payee: string; amountCents: number } | null;
  parts: Array<{ category: string; categoryId: number | null; cents: number }>;
  itemCount: number;
};

export type ReceiptImportJson = {
  receipts: ReceiptPreviewJson[];
  /** Category names the book doesn't have and that aren't mapped yet. */
  unknownCategories: string[];
  matched: number;
  created: number;
};

/** "Receipt: Bananas, Milk, Paper towels, and 4 more", for the memo. */
function receiptMemo(receipt: ReadReceipt): string {
  const names = receipt.items.map((item) => item.name).filter(Boolean);
  const shown = names.slice(0, 5).join(", ");
  const lines = [
    names.length === 0
      ? "Receipt"
      : names.length > 5
        ? `Receipt: ${shown}, and ${names.length - 5} more`
        : `Receipt: ${shown}`,
    receipt.note,
  ].filter(Boolean);
  return lines.join("\n").slice(0, 600);
}

type Plan = {
  preview: ReceiptPreviewJson;
  receipt: ReadReceipt;
  /** Signed: negative for a purchase. */
  amountCents: number;
  accountId: number | null;
  cardId: number | null;
};

/**
 * What adding a pasted document's receipts would do: for each, the transaction it
 * matches (same account, same amount, dated a couple of days before to a week after
 * the receipt, without a receipt yet) or a new one, and how it splits by category.
 * With `dryRun` false, it does it: receipts with problems, duplicates, and skipped ones
 * are left out.
 */
export function importReceipts(
  db: Queryable,
  input: ReceiptImportInput,
  dryRun: boolean,
): ReceiptImportJson {
  const choices = receiptImportSchema.parse(input);
  return db.transaction((tx) => {
    requireBook(tx, choices.bookId, "body");
    const accounts = tx
      .select()
      .from(moneyAccounts)
      .where(eq(moneyAccounts.bookId, choices.bookId))
      .all();
    const fallback =
      choices.accountId === null ? null : accounts.find((a) => a.id === choices.accountId);
    if (choices.accountId !== null && !fallback) {
      throw badRequest("That account isn't in this book. Pick one of its accounts.");
    }
    const cards = tx
      .select({ card: moneyCards })
      .from(moneyCards)
      .innerJoin(moneyAccounts, eq(moneyAccounts.id, moneyCards.accountId))
      .where(eq(moneyAccounts.bookId, choices.bookId))
      .all()
      .map((row) => row.card);
    const categories = tx
      .select()
      .from(moneyCategories)
      .where(eq(moneyCategories.bookId, choices.bookId))
      .all();
    const byName = new Map(categories.map((category) => [categoryKey(category.name), category]));
    const mapped = new Map(
      Object.entries(choices.categoryMap).map(([name, categoryId]) => [
        categoryKey(name),
        categoryId,
      ]),
    );
    for (const categoryId of mapped.values()) {
      if (!categories.some((category) => category.id === categoryId)) {
        throw badRequest("A chosen category isn't in this book. Pick one of its categories.");
      }
    }
    const categoryFor = (name: string) =>
      name.trim() === ""
        ? null
        : (mapped.get(categoryKey(name)) ?? byName.get(categoryKey(name))?.id ?? null);

    const unknown = new Map<string, string>();
    const claimed = new Set<number>();
    const plans: Plan[] = readReceipts(choices.document).map((receipt, index) => {
      const problems = [...receipt.problems];
      const card =
        receipt.cardLast4 === null
          ? null
          : (cards
              .filter((entry) => entry.last4 === receipt.cardLast4)
              .sort((a, b) => Number(a.archived) - Number(b.archived))[0] ?? null);
      if (receipt.cardLast4 !== null && !card) {
        problems.push(
          `No card in this book ends in ${receipt.cardLast4}. Add its last 4 digits to the card, or pick an account for receipts without one.`,
        );
      }
      const account = card
        ? (accounts.find((entry) => entry.id === card.accountId) ?? null)
        : (fallback ?? null);
      if (!account) problems.push("Pick the account it was paid from.");
      const totalCents = receipt.totalCents ?? 0;
      const amountCents = receipt.type === "return" ? totalCents : -totalCents;

      const shares = receipt.totalCents === null ? [] : receiptParts(receipt, totalCents);
      const parts = shares.map((share) => ({
        category: share.category,
        categoryId: categoryFor(share.category),
        cents: share.cents,
      }));
      for (const part of parts) {
        if (part.categoryId === null) {
          if (part.category.trim() === "") {
            problems.push("Some lines have no category. Add one to each line, or to the receipt.");
          } else {
            unknown.set(categoryKey(part.category), part.category);
          }
        }
      }
      if (parts.some((part) => part.categoryId === null && part.category.trim() !== "")) {
        problems.push("Some categories aren't in this book. Pick one for each below.");
      }

      const preview: ReceiptPreviewJson = {
        index,
        store: receipt.store,
        date: receipt.date,
        totalCents: receipt.totalCents,
        type: receipt.type,
        outcome: "blocked",
        problems: [...new Set(problems)],
        account: account ? { id: account.id, name: account.name } : null,
        card: card ? { id: card.id, name: card.name, last4: card.last4 } : null,
        match: null,
        parts,
        itemCount: receipt.items.length,
      };
      const plan: Plan = {
        preview,
        receipt,
        amountCents,
        accountId: account?.id ?? null,
        cardId: card?.id ?? null,
      };
      if (choices.skip.includes(index)) {
        preview.outcome = "skip";
        return plan;
      }
      if (preview.problems.length > 0 || !account || !receipt.date) return plan;

      // Imported before: the same store, day, and total in this book.
      const before = tx
        .select({ id: moneyReceipts.id })
        .from(moneyReceipts)
        .innerJoin(moneyTransactions, eq(moneyTransactions.id, moneyReceipts.transactionId))
        .innerJoin(moneyAccounts, eq(moneyAccounts.id, moneyTransactions.accountId))
        .where(
          and(
            eq(moneyAccounts.bookId, choices.bookId),
            sql`lower(${moneyReceipts.store}) = lower(${receipt.store})`,
            eq(moneyReceipts.date, receipt.date),
            eq(moneyReceipts.totalCents, totalCents),
            eq(moneyReceipts.type, receipt.type),
          ),
        )
        .get();
      if (before) {
        preview.outcome = "duplicate";
        return plan;
      }

      const candidates = tx
        .select({
          id: moneyTransactions.id,
          date: moneyTransactions.date,
          payee: moneyTransactions.payee,
          amountCents: moneyTransactions.amountCents,
          cardId: moneyTransactions.cardId,
          receipt: moneyReceipts.id,
        })
        .from(moneyTransactions)
        .leftJoin(moneyReceipts, eq(moneyReceipts.transactionId, moneyTransactions.id))
        .where(
          and(
            eq(moneyTransactions.accountId, account.id),
            eq(moneyTransactions.amountCents, amountCents),
            isNull(moneyTransactions.transferPeerId),
            gte(moneyTransactions.date, addDays(receipt.date, -DAYS_BEFORE)),
            lte(moneyTransactions.date, addDays(receipt.date, DAYS_AFTER)),
          ),
        )
        .all()
        .filter(
          (row) =>
            row.receipt === null &&
            !claimed.has(row.id) &&
            (card === null || row.cardId === null || row.cardId === card.id),
        );
      const gap = (date: string) =>
        Math.abs(Date.parse(`${date}T00:00:00Z`) - Date.parse(`${receipt.date}T00:00:00Z`));
      const match = candidates.sort((a, b) => gap(a.date) - gap(b.date) || a.id - b.id)[0];
      if (match) {
        claimed.add(match.id);
        preview.outcome = "match";
        preview.match = {
          id: match.id,
          date: match.date,
          payee: match.payee,
          amountCents: match.amountCents,
        };
      } else {
        preview.outcome = "create";
      }
      return plan;
    });

    const result: ReceiptImportJson = {
      receipts: plans.map((plan) => plan.preview),
      unknownCategories: [...unknown.values()].sort(),
      matched: plans.filter((plan) => plan.preview.outcome === "match").length,
      created: plans.filter((plan) => plan.preview.outcome === "create").length,
    };
    if (dryRun) return result;

    for (const plan of plans) {
      const { preview, receipt } = plan;
      if (preview.outcome !== "match" && preview.outcome !== "create") continue;
      if (!receipt.date || preview.totalCents === null || plan.accountId === null) continue;
      const sign = receipt.type === "return" ? 1 : -1;
      const parts = preview.parts.map((part) => ({
        categoryId: part.categoryId ?? 0,
        amountCents: sign * part.cents,
        memo: "",
      }));
      const categorize =
        parts.length > 1 ? { splits: parts } : { categoryId: parts[0]?.categoryId ?? null };
      const memo = receiptMemo(receipt);

      let transactionId: number;
      let before: ReceiptBefore | null = null;
      if (preview.outcome === "match" && preview.match) {
        const current = requireTransaction(tx, preview.match.id);
        before = {
          payee: current.payee,
          memo: current.memo,
          categoryId: current.categoryId,
          cardId: current.cardId,
          splits: (splitsOf(tx, [current.id]).get(current.id) ?? []).map((part) => ({
            categoryId: part.categoryId,
            amountCents: part.amountCents,
            memo: part.memo,
          })),
        };
        // The store's name replaces the bank's text, not a payee picked by hand or a rule.
        const renamed = current.payee !== "" && current.payee !== (current.bankPayee ?? "");
        updateTransaction(tx, current.id, {
          ...(renamed ? {} : { payee: receipt.store }),
          memo: (current.memo ? `${current.memo}\n${memo}` : memo).slice(0, 2_000),
          ...(current.cardId === null && plan.cardId !== null ? { cardId: plan.cardId } : {}),
          ...categorize,
        });
        transactionId = current.id;
      } else {
        transactionId = createTransaction(tx, {
          accountId: plan.accountId,
          date: receipt.date,
          amountCents: plan.amountCents,
          payee: receipt.store,
          memo,
          cardId: plan.cardId,
          ...categorize,
        }).id;
      }
      tx.insert(moneyReceipts)
        .values({
          transactionId,
          store: receipt.store,
          date: receipt.date,
          totalCents: preview.totalCents,
          type: receipt.type,
          items: receipt.items,
          note: receipt.note,
          createdTransaction: preview.outcome === "create",
          before,
        })
        .run();
    }
    return result;
  });
}

export type ReceiptRemoved = { outcome: "deleted" | "restored" | "kept" };

/**
 * Takes a receipt off its transaction. A transaction the receipt added goes with it,
 * unless a bank file has found it since; one the receipt was added to goes back to
 * how it was before.
 */
export function removeReceipt(db: Queryable, receiptId: number): ReceiptRemoved {
  return db.transaction((tx) => {
    const receipt = tx.select().from(moneyReceipts).where(eq(moneyReceipts.id, receiptId)).get();
    if (!receipt) throw notFound("That receipt doesn't exist. It may have been removed.");
    tx.delete(moneyReceipts).where(eq(moneyReceipts.id, receiptId)).run();
    if (receipt.createdTransaction) {
      if (receipt.bankMatched) return { outcome: "kept" as const };
      deleteTransaction(tx, receipt.transactionId);
      return { outcome: "deleted" as const };
    }
    const before = receipt.before;
    if (before) {
      try {
        updateTransaction(tx, receipt.transactionId, {
          payee: before.payee,
          memo: before.memo,
          cardId: before.cardId,
          ...(before.splits.length > 1
            ? { splits: before.splits }
            : { categoryId: before.categoryId, splits: null }),
        });
      } catch (error) {
        // Changed since in a way the old card, category, or parts no longer fit (the
        // card was deleted, the amount changed, it became a transfer): the payee and
        // memo still go back, and the rest stays as it is now.
        if (!(error instanceof HTTPException)) throw error;
        updateTransaction(tx, receipt.transactionId, { payee: before.payee, memo: before.memo });
      }
    }
    return { outcome: "restored" as const };
  });
}
