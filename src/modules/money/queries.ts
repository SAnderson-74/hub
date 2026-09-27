import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, toApiError } from "../../client/lib/api";
import type {
  AccountCreate,
  AccountUpdate,
  BookCreate,
  BookUpdate,
  CategoryCreate,
  CategoryUpdate,
  TransactionCreate,
  TransactionUpdate,
} from "../../shared/books";

async function fetchBooks() {
  const res = await api.money.books.$get();
  if (!res.ok) throw await toApiError(res);
  return res.json();
}

async function fetchAccounts(bookId: number) {
  const res = await api.money.accounts.$get({ query: { bookId: String(bookId) } });
  if (!res.ok) throw await toApiError(res);
  return res.json();
}

async function fetchCategories(bookId: number) {
  const res = await api.money.categories.$get({ query: { bookId: String(bookId) } });
  if (!res.ok) throw await toApiError(res);
  return res.json();
}

export type TransactionFilters = {
  accountId?: number;
  /** A category id, or "none" for uncategorized. */
  categoryId?: number | "none";
  q?: string;
  limit: number;
};

async function fetchTransactions(bookId: number, filters: TransactionFilters) {
  const res = await api.money.transactions.$get({
    query: {
      bookId: String(bookId),
      limit: String(filters.limit),
      ...(filters.accountId === undefined ? {} : { accountId: String(filters.accountId) }),
      ...(filters.categoryId === undefined ? {} : { categoryId: String(filters.categoryId) }),
      ...(filters.q ? { q: filters.q } : {}),
    },
  });
  if (!res.ok) throw await toApiError(res);
  return res.json();
}

export type Book = Awaited<ReturnType<typeof fetchBooks>>[number];
export type Account = Awaited<ReturnType<typeof fetchAccounts>>[number];
export type Category = Awaited<ReturnType<typeof fetchCategories>>[number];
export type TransactionPage = Awaited<ReturnType<typeof fetchTransactions>>;
export type Transaction = TransactionPage["transactions"][number];

const keys = {
  all: ["money"] as const,
  books: ["money", "books"] as const,
  accounts: (bookId: number) => ["money", "accounts", bookId] as const,
  categories: (bookId: number) => ["money", "categories", bookId] as const,
  transactions: (bookId: number, filters: TransactionFilters) =>
    ["money", "transactions", bookId, filters] as const,
};

export function useBooks() {
  return useQuery({ queryKey: keys.books, queryFn: fetchBooks });
}

export function useAccounts(bookId: number | null) {
  return useQuery({
    queryKey: keys.accounts(bookId ?? 0),
    queryFn: () => fetchAccounts(bookId ?? 0),
    enabled: bookId !== null,
  });
}

export function useCategories(bookId: number | null) {
  return useQuery({
    queryKey: keys.categories(bookId ?? 0),
    queryFn: () => fetchCategories(bookId ?? 0),
    enabled: bookId !== null,
  });
}

/** Keeps the last page on screen while a new filter or a longer page loads. */
export function useTransactions(bookId: number | null, filters: TransactionFilters) {
  return useQuery({
    queryKey: keys.transactions(bookId ?? 0, filters),
    queryFn: () => fetchTransactions(bookId ?? 0, filters),
    enabled: bookId !== null,
    placeholderData: keepPreviousData,
  });
}

/**
 * Any money write can change balances, counts, and lists across a book, so each
 * refreshes everything under "money". It's one person's data; that's cheap.
 */
function useMoneyMutation<Input, Output>(mutationFn: (input: Input) => Promise<Output>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSettled: () => void queryClient.invalidateQueries({ queryKey: keys.all }),
  });
}

export function useCreateBook() {
  return useMoneyMutation(async (json: BookCreate) => {
    const res = await api.money.books.$post({ json });
    if (!res.ok) throw await toApiError(res);
    return res.json();
  });
}

export function useUpdateBook() {
  return useMoneyMutation(async ({ id, patch }: { id: number; patch: BookUpdate }) => {
    const res = await api.money.books[":id"].$patch({ param: { id: String(id) }, json: patch });
    if (!res.ok) throw await toApiError(res);
    return res.json();
  });
}

export function useDeleteBook() {
  return useMoneyMutation(async (id: number) => {
    const res = await api.money.books[":id"].$delete({ param: { id: String(id) } });
    if (!res.ok) throw await toApiError(res);
  });
}

export function useCreateAccount() {
  return useMoneyMutation(async (json: AccountCreate) => {
    const res = await api.money.accounts.$post({ json });
    if (!res.ok) throw await toApiError(res);
    return res.json();
  });
}

export function useUpdateAccount() {
  return useMoneyMutation(async ({ id, patch }: { id: number; patch: AccountUpdate }) => {
    const res = await api.money.accounts[":id"].$patch({ param: { id: String(id) }, json: patch });
    if (!res.ok) throw await toApiError(res);
    return res.json();
  });
}

export function useDeleteAccount() {
  return useMoneyMutation(async (id: number) => {
    const res = await api.money.accounts[":id"].$delete({ param: { id: String(id) } });
    if (!res.ok) throw await toApiError(res);
  });
}

export function useCreateCategory() {
  return useMoneyMutation(async (json: CategoryCreate) => {
    const res = await api.money.categories.$post({ json });
    if (!res.ok) throw await toApiError(res);
    return res.json();
  });
}

export function useUpdateCategory() {
  return useMoneyMutation(async ({ id, patch }: { id: number; patch: CategoryUpdate }) => {
    const res = await api.money.categories[":id"].$patch({
      param: { id: String(id) },
      json: patch,
    });
    if (!res.ok) throw await toApiError(res);
    return res.json();
  });
}

export function useDeleteCategory() {
  return useMoneyMutation(async (id: number) => {
    const res = await api.money.categories[":id"].$delete({ param: { id: String(id) } });
    if (!res.ok) throw await toApiError(res);
  });
}

export function useCreateTransaction() {
  return useMoneyMutation(async (json: TransactionCreate) => {
    const res = await api.money.transactions.$post({ json });
    if (!res.ok) throw await toApiError(res);
    return res.json();
  });
}

export function useUpdateTransaction() {
  return useMoneyMutation(async ({ id, patch }: { id: number; patch: TransactionUpdate }) => {
    const res = await api.money.transactions[":id"].$patch({
      param: { id: String(id) },
      json: patch,
    });
    if (!res.ok) throw await toApiError(res);
    return res.json();
  });
}

export function useDeleteTransaction() {
  return useMoneyMutation(async (id: number) => {
    const res = await api.money.transactions[":id"].$delete({ param: { id: String(id) } });
    if (!res.ok) throw await toApiError(res);
  });
}
