import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { localDateParts } from "../../server/db/backup";
import type { Queryable } from "../../server/db/client";
import type { Deps } from "../../server/deps";
import type { AppEnv } from "../../server/env";
import { idParamSchema, invalid } from "../../server/validate";
import { bankImportSchema } from "../../shared/bankImport";
import {
  billCreateSchema,
  billDismissSchema,
  billUpdateSchema,
  forecastQuerySchema,
} from "../../shared/bills";
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
import { budgetQuerySchema, budgetSetSchema, budgetSettingsSchema } from "../../shared/budget";
import { cardCreateSchema, cardUpdateSchema } from "../../shared/cards";
import { cashFlowQuerySchema } from "../../shared/cashFlow";
import {
  categorizeApplySchema,
  categorizeQuerySchema,
  fillPeopleSchema,
} from "../../shared/categorize";
import { debtPlanSchema, debtTermsSchema } from "../../shared/debt";
import { healthQuerySchema } from "../../shared/health";
import { insightsQuerySchema, yearReviewQuerySchema } from "../../shared/insights";
import { netWorthQuerySchema } from "../../shared/netWorth";
import { owedCreateSchema, owedMatchSchema, owedUpdateSchema } from "../../shared/owed";
import { receiptImportSchema } from "../../shared/receipts";
import {
  pointBalanceSchema,
  redemptionSchema,
  rewardsQuerySchema,
  rewardsSaveSchema,
} from "../../shared/rewards";
import type { Fund, IncomeSet } from "../../shared/tithing";
import { setDonation, setIncome } from "../tithing/tithing.service";
import {
  createBill,
  deleteBill,
  dismissBill,
  forecast,
  listBills,
  updateBill,
} from "./bills.service";
import { budgetMonth, setBudget, setBudgetSettings } from "./budget.service";
import { createCard, deleteCard, listCards, updateCard } from "./cards.service";
import { cashFlow } from "./cashFlow.service";
import { applyCategory, categorizeOverview, fillPeople } from "./categorize.service";
import { listDebts, setDebtPlan, setDebtTerms } from "./debts.service";
import { health } from "./health.service";
import { importBankFile, listImports, listLayouts, undoImport } from "./import.service";
import { insights, yearReview } from "./insights.service";
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
  oneTransaction,
  requireTransaction,
  updateAccount,
  updateBook,
  updateCategory,
  updateTransaction,
} from "./money.service";
import { netWorth } from "./netWorth.service";
import { importReceipts, removeReceipt } from "./receipts.service";
import {
  createOwed,
  deleteOwed,
  listOwed,
  matchRepayment,
  transactionOwed,
  unmatchRepayment,
  updateOwed,
} from "./reimbursements.service";
import {
  addRedemption,
  cardPoints,
  deletePointBalance,
  deleteRedemption,
  deleteRewards,
  getRewards,
  rewardsReport,
  savePointBalance,
  saveRewards,
} from "./rewards.service";
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

/**
 * Applies the tithing choice or donation fund sent with a transaction, in the same
 * database transaction as the change itself, and answers with the transaction as it
 * stands. Null when neither was sent.
 */
function withTithing(
  tx: Queryable,
  id: number,
  tithing: IncomeSet | undefined,
  donation: Fund | null | undefined,
) {
  if (tithing === undefined && donation === undefined) return null;
  if (tithing !== undefined) setIncome(tx, id, tithing);
  if (donation !== undefined) setDonation(tx, id, donation);
  return oneTransaction(tx, requireTransaction(tx, id));
}
const bookQuery = zValidator("query", bookQuerySchema, invalid("Pass the book as bookId."));

/** Books, their accounts, cards, and categories, transactions, transfers, rules, sorting, budgets, cash flow, net worth, and imports. */
export function moneyRoutes({ db, config }: Deps) {
  // "Today" for bills and the forecast, in the owner's time zone.
  const today = () => localDateParts(new Date(), config.timeZone).date;
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
      .get("/cards/:id/rewards", idParam, (c) => c.json(getRewards(db, c.req.valid("param").id)))
      .put(
        "/cards/:id/rewards",
        idParam,
        zValidator("json", rewardsSaveSchema, invalid("Those rewards aren't valid.")),
        (c) => c.json(saveRewards(db, c.req.valid("param").id, c.req.valid("json"))),
      )
      .delete("/cards/:id/rewards", idParam, (c) => {
        deleteRewards(db, c.req.valid("param").id);
        return c.body(null, 204);
      })
      .get("/cards/:id/points", idParam, (c) => c.json(cardPoints(db, c.req.valid("param").id)))
      .post(
        "/cards/:id/point-balances",
        idParam,
        zValidator("json", pointBalanceSchema, invalid("That balance isn't valid.")),
        (c) => c.json(savePointBalance(db, c.req.valid("param").id, c.req.valid("json"))),
      )
      .delete("/point-balances/:id", idParam, (c) =>
        c.json(deletePointBalance(db, c.req.valid("param").id)),
      )
      .post(
        "/cards/:id/redemptions",
        idParam,
        zValidator("json", redemptionSchema, invalid("That redemption isn't valid.")),
        (c) => c.json(addRedemption(db, c.req.valid("param").id, c.req.valid("json")), 201),
      )
      .delete("/redemptions/:id", idParam, (c) =>
        c.json(deleteRedemption(db, c.req.valid("param").id)),
      )
      .get(
        "/rewards",
        zValidator(
          "query",
          rewardsQuerySchema,
          invalid(
            "Pass the book as bookId, a year, and the flat rate to compare with as baseline.",
          ),
        ),
        (c) => {
          const { bookId, year, baseline } = c.req.valid("query");
          return c.json(rewardsReport(db, bookId, year, baseline));
        },
      )
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
        (c) => {
          const { tithing, donation, ...fields } = c.req.valid("json");
          return c.json(
            db.transaction((tx) => {
              const created = createTransaction(tx, fields);
              return withTithing(tx, created.id, tithing, donation) ?? created;
            }),
            201,
          );
        },
      )
      .get("/transactions/:id", idParam, (c) => {
        const id = c.req.valid("param").id;
        return c.json(oneTransaction(db, requireTransaction(db, id)));
      })
      .patch(
        "/transactions/:id",
        idParam,
        zValidator(
          "json",
          transactionUpdateSchema,
          invalid("Those transaction changes aren't valid."),
        ),
        (c) => {
          const id = c.req.valid("param").id;
          const { tithing, donation, ...patch } = c.req.valid("json");
          return c.json(
            db.transaction((tx) => {
              const updated = updateTransaction(tx, id, patch);
              return withTithing(tx, id, tithing, donation) ?? updated;
            }),
          );
        },
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
      // Receipts pasted from a Claude Project (hub-receipt/v1). Like every route, behind
      // Tailscale sign-in; the pasted text is checked field by field and never stored as is.
      .post(
        "/receipts",
        zValidator(
          "query",
          z.object({ dryRun: z.enum(["true", "false"]).optional() }),
          invalid("Use dryRun=true to preview, or leave it out to add the receipts."),
        ),
        zValidator(
          "json",
          receiptImportSchema,
          invalid(
            "Those receipts don't fit the hub-receipt/v1 format. Copy the Claude Project's whole answer again.",
          ),
        ),
        (c) => {
          const dryRun = c.req.valid("query").dryRun === "true";
          return c.json(importReceipts(db, c.req.valid("json"), dryRun), dryRun ? 200 : 201);
        },
      )
      .delete("/receipts/:id", idParam, (c) => c.json(removeReceipt(db, c.req.valid("param").id)))
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
      // Carrying unspent money over, and saving up for a cost (a sinking fund).
      .put(
        "/budget-settings",
        zValidator("json", budgetSettingsSchema, invalid("Those budget settings aren't valid.")),
        (c) => c.json(setBudgetSettings(db, c.req.valid("json"))),
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
      // Spending month over month and year over year, and a year in review.
      .get(
        "/insights",
        zValidator(
          "query",
          insightsQuerySchema,
          invalid("Pass the book as bookId and a month like 2030-01."),
        ),
        (c) => {
          const { bookId, month } = c.req.valid("query");
          return c.json(insights(db, bookId, month));
        },
      )
      .get(
        "/year-review",
        zValidator(
          "query",
          yearReviewQuerySchema,
          invalid("Pass the book as bookId and a year like 2030."),
        ),
        (c) => {
          const { bookId, year } = c.req.valid("query");
          return c.json(yearReview(db, bookId, year));
        },
      )
      // Debts and the plan for paying them off, and money health numbers.
      .get("/debts", bookQuery, (c) => c.json(listDebts(db, c.req.valid("query").bookId)))
      .put(
        "/debts/:id",
        idParam,
        zValidator("json", debtTermsSchema, invalid("Give the rate and the minimum payment.")),
        (c) => c.json(setDebtTerms(db, c.req.valid("param").id, c.req.valid("json"))),
      )
      .put(
        "/debt-plan",
        zValidator("json", debtPlanSchema, invalid("That payoff plan isn't valid.")),
        (c) => c.json(setDebtPlan(db, c.req.valid("json"))),
      )
      .get(
        "/health",
        zValidator("query", healthQuerySchema, invalid("Pass the book as bookId.")),
        (c) => c.json(health(db, c.req.valid("query").bookId, today())),
      )
      // Money owed back on spending, and the repayments that settle it.
      .get("/owed", bookQuery, (c) => c.json(listOwed(db, c.req.valid("query").bookId)))
      .get("/transactions/:id/owed", idParam, (c) =>
        c.json(transactionOwed(db, c.req.valid("param").id)),
      )
      .post(
        "/owed",
        zValidator("json", owedCreateSchema, invalid("Say how much is owed back, and by whom.")),
        (c) => c.json(createOwed(db, c.req.valid("json")), 201),
      )
      .patch(
        "/owed/:id",
        idParam,
        zValidator("json", owedUpdateSchema, invalid("Those changes to what's owed aren't valid.")),
        (c) => c.json(updateOwed(db, c.req.valid("param").id, c.req.valid("json"))),
      )
      .delete("/owed/:id", idParam, (c) => {
        deleteOwed(db, c.req.valid("param").id);
        return c.body(null, 204);
      })
      .post(
        "/owed/:id/repaid",
        idParam,
        zValidator("json", owedMatchSchema, invalid("Pick the repayment as repaymentId.")),
        (c) => c.json(matchRepayment(db, c.req.valid("param").id, c.req.valid("json").repaymentId)),
      )
      .delete("/owed/:id/repaid", idParam, (c) =>
        c.json(unmatchRepayment(db, c.req.valid("param").id)),
      )
      // Bills, subscriptions, and repeating income, with suggestions from repeating payments.
      .get("/bills", bookQuery, (c) => c.json(listBills(db, c.req.valid("query").bookId, today())))
      .post(
        "/bills",
        zValidator("json", billCreateSchema, invalid("That bill isn't valid.")),
        (c) => c.json(createBill(db, c.req.valid("json"), today()), 201),
      )
      .post(
        "/bills/dismiss",
        zValidator("json", billDismissSchema, invalid("Say which suggestion isn't a bill.")),
        (c) => {
          dismissBill(db, c.req.valid("json"), today());
          return c.body(null, 204);
        },
      )
      .patch(
        "/bills/:id",
        idParam,
        zValidator("json", billUpdateSchema, invalid("Those bill changes aren't valid.")),
        (c) => c.json(updateBill(db, c.req.valid("param").id, c.req.valid("json"), today())),
      )
      .delete("/bills/:id", idParam, (c) => {
        deleteBill(db, c.req.valid("param").id);
        return c.body(null, 204);
      })
      .get(
        "/forecast",
        zValidator(
          "query",
          forecastQuerySchema,
          invalid("Pass the book as bookId and days as 30, 60, or 90."),
        ),
        (c) => {
          const { bookId, days } = c.req.valid("query");
          return c.json(forecast(db, bookId, days, today()));
        },
      )
  );
}
