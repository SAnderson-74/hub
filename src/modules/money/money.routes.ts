import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import type { Deps } from "../../server/deps";
import type { AppEnv } from "../../server/env";
import { idParamSchema, invalid } from "../../server/validate";
import { bankImportSchema } from "../../shared/bankImport";
import {
  accountCreateSchema,
  accountUpdateSchema,
  bookCreateSchema,
  bookQuerySchema,
  bookUpdateSchema,
  categoryCreateSchema,
  categoryUpdateSchema,
  ruleApplySchema,
  ruleCreateSchema,
  ruleMoveSchema,
  ruleUpdateSchema,
  snapshotSaveSchema,
  transactionCreateSchema,
  transactionQuerySchema,
  transactionUpdateSchema,
  transferCreateSchema,
  transferLinkSchema,
} from "../../shared/books";
import { budgetQuerySchema, budgetSetSchema } from "../../shared/budget";
import { cardCreateSchema, cardUpdateSchema } from "../../shared/cards";
import { cashFlowQuerySchema } from "../../shared/cashFlow";
import {
  categorizeApplySchema,
  categorizeQuerySchema,
  fillPeopleSchema,
} from "../../shared/categorize";
import { netWorthQuerySchema } from "../../shared/netWorth";
import { budgetMonth, setBudget } from "./budget.service";
import { createCard, deleteCard, listCards, updateCard } from "./cards.service";
import { cashFlow } from "./cashFlow.service";
import { applyCategory, categorizeOverview, fillPeople } from "./categorize.service";
import { importBankFile, listImports, listLayouts, undoImport } from "./import.service";
import {
  allAccounts,
  createAccount,
  createBook,
  createCategory,
  createTransaction,
  deleteAccount,
  deleteBook,
  deleteCategory,
  deleteTransaction,
  listAccounts,
  listBooks,
  listCategories,
  listTransactions,
  updateAccount,
  updateBook,
  updateCategory,
  updateTransaction,
} from "./money.service";
import { netWorth } from "./netWorth.service";
import {
  applyRules,
  createRule,
  deleteRule,
  listRules,
  moveRule,
  updateRule,
} from "./rules.service";
import { accountHistory, deleteSnapshot, saveSnapshot } from "./snapshots.service";
import {
  createTransfer,
  linkTransfer,
  transferMatches,
  transferSuggestions,
  unlinkTransfer,
} from "./transfers.service";

const idParam = zValidator("param", idParamSchema, invalid("Use a numeric id."));
const bookQuery = zValidator("query", bookQuerySchema, invalid("Pass the book as bookId."));

/** Books, their accounts, cards, and categories, transactions, transfers, rules, sorting, budgets, cash flow, net worth, and imports. */
export function moneyRoutes({ db }: Deps) {
  return (
    new Hono<AppEnv>()
      .get("/books", (c) => c.json(listBooks(db)))
      .post(
        "/books",
        zValidator("json", bookCreateSchema, invalid("That book isn't valid.")),
        (c) => c.json(createBook(db, c.req.valid("json")), 201),
      )
      .patch(
        "/books/:id",
        idParam,
        zValidator("json", bookUpdateSchema, invalid("Those book changes aren't valid.")),
        (c) => c.json(updateBook(db, c.req.valid("param").id, c.req.valid("json"))),
      )
      .delete("/books/:id", idParam, (c) => {
        deleteBook(db, c.req.valid("param").id);
        return c.body(null, 204);
      })
      .get("/accounts", bookQuery, (c) => c.json(listAccounts(db, c.req.valid("query").bookId)))
      // Every account in every book, for choosing accounts outside Money (savings goals).
      .get("/all-accounts", (c) => c.json(allAccounts(db)))
      .get("/accounts/:id/history", idParam, (c) =>
        c.json(accountHistory(db, c.req.valid("param").id)),
      )
      .put(
        "/accounts/:id/snapshots",
        idParam,
        zValidator("json", snapshotSaveSchema, invalid("That balance isn't valid.")),
        (c) => c.json(saveSnapshot(db, c.req.valid("param").id, c.req.valid("json"))),
      )
      .delete("/snapshots/:id", idParam, (c) => c.json(deleteSnapshot(db, c.req.valid("param").id)))
      .post(
        "/accounts",
        zValidator("json", accountCreateSchema, invalid("That account isn't valid.")),
        (c) => c.json(createAccount(db, c.req.valid("json")), 201),
      )
      .patch(
        "/accounts/:id",
        idParam,
        zValidator("json", accountUpdateSchema, invalid("Those account changes aren't valid.")),
        (c) => c.json(updateAccount(db, c.req.valid("param").id, c.req.valid("json"))),
      )
      .delete("/accounts/:id", idParam, (c) => {
        deleteAccount(db, c.req.valid("param").id);
        return c.body(null, 204);
      })
      .get("/cards", bookQuery, (c) => c.json(listCards(db, c.req.valid("query").bookId)))
      .post(
        "/cards",
        zValidator("json", cardCreateSchema, invalid("That card isn't valid.")),
        (c) => c.json(createCard(db, c.req.valid("json")), 201),
      )
      .patch(
        "/cards/:id",
        idParam,
        zValidator("json", cardUpdateSchema, invalid("Those card changes aren't valid.")),
        (c) => c.json(updateCard(db, c.req.valid("param").id, c.req.valid("json"))),
      )
      .delete("/cards/:id", idParam, (c) => {
        deleteCard(db, c.req.valid("param").id);
        return c.body(null, 204);
      })
      .get("/categories", bookQuery, (c) => c.json(listCategories(db, c.req.valid("query").bookId)))
      .post(
        "/categories",
        zValidator("json", categoryCreateSchema, invalid("That category isn't valid.")),
        (c) => c.json(createCategory(db, c.req.valid("json")), 201),
      )
      .patch(
        "/categories/:id",
        idParam,
        zValidator("json", categoryUpdateSchema, invalid("Those category changes aren't valid.")),
        (c) => c.json(updateCategory(db, c.req.valid("param").id, c.req.valid("json"))),
      )
      .delete("/categories/:id", idParam, (c) => {
        deleteCategory(db, c.req.valid("param").id);
        return c.body(null, 204);
      })
      .get(
        "/transactions",
        zValidator("query", transactionQuerySchema, invalid("Those filters aren't valid.")),
        (c) => c.json(listTransactions(db, c.req.valid("query"))),
      )
      .post(
        "/transactions",
        zValidator("json", transactionCreateSchema, invalid("That transaction isn't valid.")),
        (c) => c.json(createTransaction(db, c.req.valid("json")), 201),
      )
      .patch(
        "/transactions/:id",
        idParam,
        zValidator(
          "json",
          transactionUpdateSchema,
          invalid("Those transaction changes aren't valid."),
        ),
        (c) => c.json(updateTransaction(db, c.req.valid("param").id, c.req.valid("json"))),
      )
      .delete("/transactions/:id", idParam, (c) => {
        deleteTransaction(db, c.req.valid("param").id);
        return c.body(null, 204);
      })
      .get("/imports", bookQuery, (c) => c.json(listImports(db, c.req.valid("query").bookId)))
      .post(
        "/imports",
        zValidator(
          "query",
          z.object({ dryRun: z.enum(["true", "false"]).optional() }),
          invalid("Use dryRun=true to preview, or leave it out to import."),
        ),
        zValidator("json", bankImportSchema, invalid("That file can't be imported.")),
        (c) => {
          const dryRun = c.req.valid("query").dryRun === "true";
          return c.json(importBankFile(db, c.req.valid("json"), dryRun), dryRun ? 200 : 201);
        },
      )
      .post("/imports/:id/undo", idParam, (c) => c.json(undoImport(db, c.req.valid("param").id)))
      .get("/import-layouts", (c) => c.json(listLayouts(db)))
      .get("/rules", bookQuery, (c) => c.json(listRules(db, c.req.valid("query").bookId)))
      .post(
        "/rules",
        zValidator("json", ruleCreateSchema, invalid("That rule isn't valid.")),
        (c) => c.json(createRule(db, c.req.valid("json")), 201),
      )
      .post(
        "/rules/apply",
        zValidator("json", ruleApplySchema, invalid("Pass the book as bookId.")),
        (c) => c.json(applyRules(db, c.req.valid("json").bookId)),
      )
      .patch(
        "/rules/:id",
        idParam,
        zValidator("json", ruleUpdateSchema, invalid("Those rule changes aren't valid.")),
        (c) => c.json(updateRule(db, c.req.valid("param").id, c.req.valid("json"))),
      )
      .post(
        "/rules/:id/move",
        idParam,
        zValidator("json", ruleMoveSchema, invalid("Move a rule earlier or later.")),
        (c) => c.json(moveRule(db, c.req.valid("param").id, c.req.valid("json").to)),
      )
      .delete("/rules/:id", idParam, (c) => c.json(deleteRule(db, c.req.valid("param").id)))
      .post(
        "/transfers",
        zValidator("json", transferCreateSchema, invalid("That transfer isn't valid.")),
        (c) => c.json(createTransfer(db, c.req.valid("json")), 201),
      )
      .post(
        "/transfers/link",
        zValidator("json", transferLinkSchema, invalid("Pass the two transactions to link.")),
        (c) => c.json(linkTransfer(db, c.req.valid("json").transactionIds)),
      )
      .get("/transfers/suggestions", bookQuery, (c) =>
        c.json(transferSuggestions(db, c.req.valid("query").bookId)),
      )
      .get("/transactions/:id/transfer-matches", idParam, (c) =>
        c.json(transferMatches(db, c.req.valid("param").id)),
      )
      .post("/transactions/:id/unlink", idParam, (c) =>
        c.json(unlinkTransfer(db, c.req.valid("param").id)),
      )
      .get(
        "/budget",
        zValidator(
          "query",
          budgetQuerySchema,
          invalid("Pass the book as bookId and a month like 2030-01."),
        ),
        (c) => {
          const { bookId, month } = c.req.valid("query");
          return c.json(budgetMonth(db, bookId, month));
        },
      )
      .get(
        "/categorize",
        zValidator("query", categorizeQuerySchema, invalid("Pass the book as bookId.")),
        (c) => c.json(categorizeOverview(db, c.req.valid("query").bookId)),
      )
      .post(
        "/categorize",
        zValidator(
          "json",
          categorizeApplySchema,
          invalid("Pick the transactions and a category to put them in."),
        ),
        (c) => c.json(applyCategory(db, c.req.valid("json"))),
      )
      .post(
        "/people/fill",
        zValidator("json", fillPeopleSchema, invalid("Pass the book as bookId.")),
        (c) => c.json(fillPeople(db, c.req.valid("json").bookId)),
      )
      .get(
        "/cash-flow",
        zValidator(
          "query",
          cashFlowQuerySchema,
          invalid("Pass the book as bookId, a month like 2030-01, and months as 1, 3, or 12."),
        ),
        (c) => c.json(cashFlow(db, c.req.valid("query"))),
      )
      .put(
        "/budgets",
        zValidator("json", budgetSetSchema, invalid("That budget isn't valid.")),
        (c) => c.json(setBudget(db, c.req.valid("json"))),
      )
      .get(
        "/net-worth",
        zValidator(
          "query",
          netWorthQuerySchema,
          invalid(
            "Pass today as to (like 2030-01-31), months as 12, 36, or 60, and bookId if you want one book.",
          ),
        ),
        (c) => c.json(netWorth(db, c.req.valid("query"))),
      )
  );
}
