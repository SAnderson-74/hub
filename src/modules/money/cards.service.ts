import { and, asc, count, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import type { Db, Queryable } from "../../server/db/client";
import { badRequest, conflict, notFound } from "../../server/errors";
import type { AccountKind } from "../../shared/books";
import {
  type CardCreate,
  type CardKind,
  type CardUpdate,
  cardKindFor,
  guessCard,
} from "../../shared/cards";
import { moneyAccounts, moneyBooks, moneyCards, moneyTransactions } from "./schema";

type CardRow = typeof moneyCards.$inferSelect;
type AccountRow = typeof moneyAccounts.$inferSelect;

export type CardJson = {
  id: number;
  account: { id: number; name: string; kind: AccountKind };
  name: string;
  kind: CardKind;
  last4: string | null;
  archived: boolean;
  /** Transactions paid with it. Deleting the card keeps them, without a card. */
  transactionCount: number;
};

/** A card change, with how many past transactions were matched to the account's cards. */
export type CardSaved = { card: CardJson; filled: number };

function requireAccountRow(db: Queryable, id: number): AccountRow {
  const row = db.select().from(moneyAccounts).where(eq(moneyAccounts.id, id)).get();
  if (!row) throw badRequest("That account doesn't exist. It may have been deleted.");
  return row;
}

function requireCard(db: Queryable, id: number, from: "path" | "body" = "path"): CardRow {
  const row = db.select().from(moneyCards).where(eq(moneyCards.id, id)).get();
  if (row) return row;
  const message = "That card doesn't exist. It may have been deleted.";
  throw from === "path" ? notFound(message) : badRequest(message);
}

function cardsJson(db: Queryable, rows: CardRow[]): CardJson[] {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const counts = new Map(
    db
      .select({ cardId: moneyTransactions.cardId, n: count() })
      .from(moneyTransactions)
      .where(inArray(moneyTransactions.cardId, ids))
      .groupBy(moneyTransactions.cardId)
      .all()
      .map((row) => [row.cardId, row.n]),
  );
  const accounts = new Map(
    db
      .select({ id: moneyAccounts.id, name: moneyAccounts.name, kind: moneyAccounts.kind })
      .from(moneyAccounts)
      .where(
        inArray(
          moneyAccounts.id,
          rows.map((row) => row.accountId),
        ),
      )
      .all()
      .map((row) => [row.id, row]),
  );
  return rows.map((row) => {
    const account = accounts.get(row.accountId) ?? {
      id: row.accountId,
      name: "",
      kind: "other" as const,
    };
    return {
      id: row.id,
      account,
      name: row.name,
      kind: cardKindFor(account.kind) ?? "debit",
      last4: row.last4,
      archived: row.archived,
      transactionCount: counts.get(row.id) ?? 0,
    };
  });
}

function oneCard(db: Queryable, row: CardRow): CardJson {
  const [card] = cardsJson(db, [row]);
  if (!card) throw new Error("Expected one card");
  return card;
}

/** A book's cards: active first, in account order. */
export function listCards(db: Queryable, bookId: number): CardJson[] {
  const book = db.select().from(moneyBooks).where(eq(moneyBooks.id, bookId)).get();
  if (!book) throw notFound("That book doesn't exist. It may have been deleted.");
  const rows = db
    .select({ card: moneyCards })
    .from(moneyCards)
    .innerJoin(moneyAccounts, eq(moneyAccounts.id, moneyCards.accountId))
    .where(eq(moneyAccounts.bookId, bookId))
    .orderBy(
      asc(moneyCards.archived),
      asc(moneyAccounts.sortOrder),
      asc(moneyAccounts.id),
      asc(moneyCards.id),
    )
    .all()
    .map((row) => row.card);
  return cardsJson(db, rows);
}

/** An account's cards, for guessing which one paid. */
export function cardsOfAccount(db: Queryable, accountId: number): CardRow[] {
  return db
    .select()
    .from(moneyCards)
    .where(eq(moneyCards.accountId, accountId))
    .orderBy(asc(moneyCards.id))
    .all();
}

/** Card names are unique in a book, ignoring case, so charts and lists can't mix them up. */
function checkNameFree(db: Queryable, bookId: number, name: string, exceptId?: number) {
  const taken = db
    .select({ id: moneyCards.id })
    .from(moneyCards)
    .innerJoin(moneyAccounts, eq(moneyAccounts.id, moneyCards.accountId))
    .where(
      and(
        eq(moneyAccounts.bookId, bookId),
        sql`lower(${moneyCards.name}) = lower(${name})`,
        exceptId === undefined ? undefined : ne(moneyCards.id, exceptId),
      ),
    )
    .get();
  if (taken) throw conflict(`This book already has a card called "${name}". Pick another name.`);
}

/** A transaction's card must be one of its account's cards. */
export function checkCardFits(db: Queryable, accountId: number, cardId: number | null) {
  if (cardId === null) return;
  const card = requireCard(db, cardId, "body");
  if (card.accountId !== accountId) {
    throw badRequest("That card belongs to another account. Pick one of this account's cards.");
  }
}

/** The card a transaction was likely made with, from its account's cards and the bank's text. */
export function guessCardFor(
  db: Queryable,
  account: { id: number; kind: AccountKind },
  row: { payee: string; memo: string; amountCents: number },
): number | null {
  return guessCard(account.kind, cardsOfAccount(db, account.id), row);
}

/**
 * Matches an account's past transactions without a card (transfers aside) to its
 * cards, by the same guesses imports use. Returns how many were matched.
 */
export function fillCards(db: Queryable, accountId: number): number {
  const account = requireAccountRow(db, accountId);
  const cards = cardsOfAccount(db, accountId);
  if (cards.length === 0) return 0;
  const rows = db
    .select({
      id: moneyTransactions.id,
      payee: moneyTransactions.payee,
      bankPayee: moneyTransactions.bankPayee,
      memo: moneyTransactions.memo,
      amountCents: moneyTransactions.amountCents,
    })
    .from(moneyTransactions)
    .where(
      and(
        eq(moneyTransactions.accountId, accountId),
        isNull(moneyTransactions.cardId),
        isNull(moneyTransactions.transferPeerId),
      ),
    )
    .all();
  const byCard = new Map<number, number[]>();
  for (const row of rows) {
    // The bank's own text says more about the card than a payee renamed since.
    const cardId = guessCard(account.kind, cards, {
      payee: row.bankPayee ?? row.payee,
      memo: row.memo,
      amountCents: row.amountCents,
    });
    if (cardId !== null) byCard.set(cardId, [...(byCard.get(cardId) ?? []), row.id]);
  }
  let filled = 0;
  const now = new Date();
  for (const [cardId, ids] of byCard) {
    // In batches, to stay under SQLite's limit on values in one statement.
    for (let start = 0; start < ids.length; start += 500) {
      const batch = ids.slice(start, start + 500);
      db.update(moneyTransactions)
        .set({ cardId, updatedAt: now })
        .where(inArray(moneyTransactions.id, batch))
        .run();
      filled += batch.length;
    }
  }
  return filled;
}

export function createCard(db: Db, input: CardCreate): CardSaved {
  return db.transaction((tx) => {
    const account = requireAccountRow(tx, input.accountId);
    if (cardKindFor(account.kind) === null) {
      throw badRequest(
        "Cards go on checking, savings, credit card, or other accounts. Pick one of those.",
      );
    }
    const name = input.name.trim();
    checkNameFree(tx, account.bookId, name);
    const row = tx
      .insert(moneyCards)
      .values({ accountId: account.id, name, last4: input.last4 || null })
      .returning()
      .get();
    const filled = fillCards(tx, account.id);
    return { card: oneCard(tx, requireCard(tx, row.id)), filled };
  });
}

export function updateCard(db: Db, id: number, patch: CardUpdate): CardSaved {
  return db.transaction((tx) => {
    const current = requireCard(tx, id);
    const account = requireAccountRow(tx, current.accountId);
    const name = patch.name?.trim();
    if (name !== undefined) checkNameFree(tx, account.bookId, name, id);
    const row = tx
      .update(moneyCards)
      .set({
        ...(name === undefined ? {} : { name }),
        ...(patch.last4 === undefined ? {} : { last4: patch.last4 || null }),
        ...(patch.archived === undefined ? {} : { archived: patch.archived }),
        updatedAt: new Date(),
      })
      .where(eq(moneyCards.id, id))
      .returning()
      .get();
    // New digits, or one card fewer or more in use, can settle transactions that weren't clear.
    const filled =
      patch.last4 !== undefined || patch.archived !== undefined ? fillCards(tx, account.id) : 0;
    return { card: oneCard(tx, row), filled };
  });
}

/** Deletes a card. Its transactions stay, without a card. */
export function deleteCard(db: Db, id: number): void {
  db.transaction((tx) => {
    requireCard(tx, id);
    tx.update(moneyTransactions)
      .set({ cardId: null, updatedAt: new Date() })
      .where(eq(moneyTransactions.cardId, id))
      .run();
    tx.delete(moneyCards).where(eq(moneyCards.id, id)).run();
  });
}
