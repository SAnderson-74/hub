import { and, desc, eq, or, type SQL, sql } from "drizzle-orm";
import { containsWords } from "../../server/db/like";
import type { Searcher } from "../core/search.service";
import { moneyAccounts, moneyBooks, moneyCategories, moneyTransactions } from "./schema";

export const moneySearchers: Searcher[] = [
  {
    kind: "transaction",
    label: "Transactions",
    module: "money",
    // By payee, memo, or who it was with; "42.18" also finds that amount, in or out.
    // Newest first. Archived books are left out, since Money doesn't show them.
    search: (db, { words, amountCents, limit }) => {
      const text = containsWords(
        [
          moneyTransactions.payee,
          moneyTransactions.memo,
          moneyTransactions.counterparty,
          moneyTransactions.bankPayee,
        ],
        words,
      );
      const matches: SQL =
        amountCents === null
          ? text
          : (or(sql`abs(${moneyTransactions.amountCents}) = ${amountCents}`, text) as SQL);
      return db
        .select({
          id: moneyTransactions.id,
          date: moneyTransactions.date,
          amountCents: moneyTransactions.amountCents,
          payee: moneyTransactions.payee,
          memo: moneyTransactions.memo,
          account: moneyAccounts.name,
          bookId: moneyAccounts.bookId,
          category: moneyCategories.name,
          transferPeerId: moneyTransactions.transferPeerId,
        })
        .from(moneyTransactions)
        .innerJoin(moneyAccounts, eq(moneyAccounts.id, moneyTransactions.accountId))
        .innerJoin(moneyBooks, eq(moneyBooks.id, moneyAccounts.bookId))
        .leftJoin(moneyCategories, eq(moneyCategories.id, moneyTransactions.categoryId))
        .where(and(eq(moneyBooks.archived, false), matches))
        .orderBy(desc(moneyTransactions.date), desc(moneyTransactions.id))
        .limit(limit)
        .all()
        .map((row) => ({
          id: row.id,
          title: row.payee || row.memo || "No payee",
          detail: [
            row.account,
            row.transferPeerId === null ? (row.category ?? "Uncategorized") : "Transfer",
          ].join(" · "),
          date: row.date,
          amountCents: row.amountCents,
          href: `/money?book=${row.bookId}&transaction=${row.id}`,
        }));
    },
  },
];
