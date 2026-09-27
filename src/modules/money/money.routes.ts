import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { Deps } from "../../server/deps";
import type { AppEnv } from "../../server/env";
import { idParamSchema, invalid } from "../../server/validate";
import {
  accountCreateSchema,
  accountUpdateSchema,
  bookCreateSchema,
  bookQuerySchema,
  bookUpdateSchema,
  categoryCreateSchema,
  categoryUpdateSchema,
  transactionCreateSchema,
  transactionQuerySchema,
  transactionUpdateSchema,
} from "../../shared/books";
import {
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

const idParam = zValidator("param", idParamSchema, invalid("Use a numeric id."));
const bookQuery = zValidator("query", bookQuerySchema, invalid("Pass the book as bookId."));

/** Books, their accounts and categories, and transactions. */
export function moneyRoutes({ db }: Deps) {
  return new Hono<AppEnv>()
    .get("/books", (c) => c.json(listBooks(db)))
    .post("/books", zValidator("json", bookCreateSchema, invalid("That book isn't valid.")), (c) =>
      c.json(createBook(db, c.req.valid("json")), 201),
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
    });
}
