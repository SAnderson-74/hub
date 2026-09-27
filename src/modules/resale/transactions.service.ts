import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  isNull,
  lt,
  lte,
  notInArray,
  type SQL,
  sql,
} from "drizzle-orm";
import type { Db, Queryable } from "../../server/db/client";
import { badRequest, conflict, notFound } from "../../server/errors";
import { formatSigned } from "../../shared/profit";
import type { LinkRole, TransactionLink, TransactionRecord } from "../../shared/resale";
import { checkCategoryFits, likePattern, requireAccount } from "../money/money.service";
import { moneyAccounts, moneyBooks, moneyTransactions } from "../money/schema";
import { getItem, type ItemJson, logItem, requireItem } from "./resale.service";
import { resaleItemTransactions, resalePlatforms } from "./schema";
import {
  type LinkedTransactionJson,
  linkedTransactionJson,
  transactionColumns,
  transactionItems,
} from "./transactionLinks";

type ItemRow = ReturnType<typeof requireItem>;

/** How far from the purchase or sale date to look for its transaction. */
const WINDOW_DAYS = 30;
const MATCH_LIMIT = 8;

export type TransactionMatchJson = LinkedTransactionJson & {
  /** The amount is exactly the item's price. */
  exact: boolean;
  /** Other items it's already linked to, like the rest of a bulk lot. */
  linkedItems: Array<{ id: number; title: string }>;
};

/** The item's price and date for a role, as a transaction would record them. */
function expected(item: ItemRow, role: LinkRole) {
  return role === "purchase"
    ? { cents: item.purchaseCents === null ? null : -item.purchaseCents, date: item.purchasedOn }
    : { cents: item.saleCents, date: item.soldOn };
}

function shiftDay(date: string, days: number): string {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}

const daysApart = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;

/**
 * Transactions that could be the item's purchase (money out) or sale (money in):
 * within a month of its date, or matching a search of payees and memos. The best
 * come first: the exact amount, then the nearest amount, then the nearest date.
 * Transfers and transactions already linked to the item are left out.
 */
export function transactionMatches(
  db: Queryable,
  itemId: number,
  { role, q }: { role: LinkRole; q?: string | undefined },
): TransactionMatchJson[] {
  const item = requireItem(db, itemId);
  const want = expected(item, role);
  const linked = db
    .select({ id: resaleItemTransactions.transactionId })
    .from(resaleItemTransactions)
    .where(eq(resaleItemTransactions.itemId, itemId))
    .all()
    .map((row) => row.id);

  const conditions: SQL[] = [
    isNull(moneyTransactions.transferPeerId),
    role === "purchase"
      ? lt(moneyTransactions.amountCents, 0)
      : gt(moneyTransactions.amountCents, 0),
  ];
  if (linked.length > 0) conditions.push(notInArray(moneyTransactions.id, linked));
  if (q) {
    const pattern = likePattern(q);
    conditions.push(
      sql`(${moneyTransactions.payee} like ${pattern} escape '\\' or ${moneyTransactions.memo} like ${pattern} escape '\\')`,
    );
  } else if (want.date) {
    conditions.push(
      gte(moneyTransactions.date, shiftDay(want.date, -WINDOW_DAYS)),
      lte(moneyTransactions.date, shiftDay(want.date, WINDOW_DAYS)),
    );
  } else if (want.cents !== null) {
    conditions.push(eq(moneyTransactions.amountCents, want.cents));
  }

  const rows = db
    .select(transactionColumns)
    .from(moneyTransactions)
    .innerJoin(moneyAccounts, eq(moneyAccounts.id, moneyTransactions.accountId))
    .innerJoin(moneyBooks, eq(moneyBooks.id, moneyAccounts.bookId))
    .where(and(...conditions))
    .orderBy(desc(moneyTransactions.date), desc(moneyTransactions.id))
    .limit(200)
    .all();

  const amountGap = (cents: number) => (want.cents === null ? 0 : Math.abs(cents - want.cents));
  const dateGap = (date: string) => (want.date ? daysApart(date, want.date) : 0);
  const best = [...rows]
    .sort(
      (a, b) =>
        amountGap(a.amountCents) - amountGap(b.amountCents) || dateGap(a.date) - dateGap(b.date),
    )
    .slice(0, MATCH_LIMIT);
  const others = transactionItems(
    db,
    best.map((row) => row.id),
  );
  return best.map((row) => ({
    ...linkedTransactionJson(row),
    exact: want.cents !== null && row.amountCents === want.cents,
    linkedItems: (others.get(row.id) ?? []).map(({ id, title }) => ({ id, title })),
  }));
}

/** "2030-01-05 -$40 Corner store", for the item's timeline. */
function linkedLabels(db: Queryable, itemId: number, role: LinkRole): string[] {
  return db
    .select({
      date: moneyTransactions.date,
      amountCents: moneyTransactions.amountCents,
      payee: moneyTransactions.payee,
    })
    .from(resaleItemTransactions)
    .innerJoin(moneyTransactions, eq(moneyTransactions.id, resaleItemTransactions.transactionId))
    .where(and(eq(resaleItemTransactions.itemId, itemId), eq(resaleItemTransactions.role, role)))
    .orderBy(asc(moneyTransactions.date), asc(moneyTransactions.id))
    .all()
    .map((row) => [row.date, formatSigned(row.amountCents), row.payee].filter(Boolean).join(" "));
}

/** Runs a change to an item's links and notes it on the item's timeline. */
function changeLinks(
  tx: Queryable,
  item: ItemRow,
  role: LinkRole,
  actor: string,
  change: () => void,
) {
  const before = linkedLabels(tx, item.id, role);
  change();
  const after = linkedLabels(tx, item.id, role);
  logItem(
    tx,
    item,
    { [role === "purchase" ? "paidWith" : "saleMoney"]: { from: before, to: after } },
    actor,
  );
}

/** Purchases are money out and sales money in; transfers are neither. */
function checkFits(
  transaction: { amountCents: number; transferPeerId: number | null },
  role: LinkRole,
) {
  if (transaction.transferPeerId !== null) {
    throw badRequest(
      "That's a transfer between your accounts, so it can't be a purchase or sale. Pick the payment itself.",
    );
  }
  if (role === "purchase" && transaction.amountCents > 0) {
    throw badRequest("A purchase is money out. Pick the transaction that paid for the item.");
  }
  if (role === "sale" && transaction.amountCents < 0) {
    throw badRequest("A sale is money in. Pick the payment you received for the item.");
  }
}

/** Links an existing transaction as the item's purchase or sale. Answers with the item. */
export function linkTransaction(
  db: Db,
  itemId: number,
  input: TransactionLink,
  actor: string,
): ItemJson {
  return db.transaction((tx) => {
    const item = requireItem(tx, itemId);
    const transaction = tx
      .select()
      .from(moneyTransactions)
      .where(eq(moneyTransactions.id, input.transactionId))
      .get();
    if (!transaction) throw badRequest("That transaction doesn't exist. It may have been deleted.");
    checkFits(transaction, input.role);
    const taken = tx
      .select({ id: resaleItemTransactions.id })
      .from(resaleItemTransactions)
      .where(
        and(
          eq(resaleItemTransactions.itemId, itemId),
          eq(resaleItemTransactions.transactionId, input.transactionId),
        ),
      )
      .get();
    if (taken) throw conflict("That transaction is already linked to this item.");
    changeLinks(tx, item, input.role, actor, () => {
      tx.insert(resaleItemTransactions)
        .values({ itemId, transactionId: input.transactionId, role: input.role })
        .run();
    });
    return getItem(tx, itemId);
  });
}

/** Removes a link. The transaction itself stays in the books. */
export function unlinkTransaction(
  db: Db,
  itemId: number,
  transactionId: number,
  actor: string,
): ItemJson {
  return db.transaction((tx) => {
    const item = requireItem(tx, itemId);
    const link = tx
      .select()
      .from(resaleItemTransactions)
      .where(
        and(
          eq(resaleItemTransactions.itemId, itemId),
          eq(resaleItemTransactions.transactionId, transactionId),
        ),
      )
      .get();
    if (!link) throw notFound("That transaction isn't linked to this item.");
    changeLinks(tx, item, link.role, actor, () => {
      tx.delete(resaleItemTransactions).where(eq(resaleItemTransactions.id, link.id)).run();
    });
    return getItem(tx, itemId);
  });
}

/**
 * Adds the item's purchase or sale to an account as a new transaction, from the
 * item's price and date, and links it. For money that no bank file will bring in,
 * like cash.
 */
export function recordTransaction(
  db: Db,
  itemId: number,
  input: TransactionRecord,
  actor: string,
): ItemJson {
  return db.transaction((tx) => {
    const item = requireItem(tx, itemId);
    const want = expected(item, input.role);
    if (want.cents === null || want.date === null) {
      throw badRequest(
        input.role === "purchase"
          ? "Add what you paid and the date you bought it first."
          : "Add the sale price and the date it sold first.",
      );
    }
    if (want.cents === 0) throw badRequest("The price is $0, so there's no money to record.");
    const account = requireAccount(tx, input.accountId, "body");
    checkCategoryFits(tx, account, input.categoryId ?? null);
    const platformId = input.role === "purchase" ? item.purchasePlatformId : item.salePlatformId;
    const platform =
      platformId === null
        ? undefined
        : tx
            .select({ name: resalePlatforms.name })
            .from(resalePlatforms)
            .where(eq(resalePlatforms.id, platformId))
            .get();
    // Who was paid or who paid, as best the item knows; the title when it doesn't say.
    const payee =
      (input.role === "purchase" ? item.purchaseFrom : "") || platform?.name || item.title;
    const cents = want.cents;
    const date = want.date;
    changeLinks(tx, item, input.role, actor, () => {
      const transaction = tx
        .insert(moneyTransactions)
        .values({
          accountId: account.id,
          date,
          amountCents: cents,
          payee: payee.slice(0, 200),
          memo: `${input.role === "purchase" ? "Bought" : "Sold"}: ${item.title}`,
          categoryId: input.categoryId ?? null,
        })
        .returning({ id: moneyTransactions.id })
        .get();
      tx.insert(resaleItemTransactions)
        .values({ itemId, transactionId: transaction.id, role: input.role })
        .run();
    });
    return getItem(tx, itemId);
  });
}
