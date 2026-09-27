import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, toApiError } from "../../client/lib/api";
import type { BankImport } from "../../shared/bankImport";
import type {
  AccountCreate,
  AccountUpdate,
  BookCreate,
  BookUpdate,
  CategoryCreate,
  CategoryUpdate,
  RuleCreate,
  TransactionCreate,
  TransactionUpdate,
  TransferCreate,
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
  /** A category id, "none" for uncategorized, or "transfer" for transfers. */
  categoryId?: number | "none" | "transfer";
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
  imports: (bookId: number) => ["money", "imports", bookId] as const,
  layouts: ["money", "import-layouts"] as const,
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

async function fetchImports(bookId: number) {
  const res = await api.money.imports.$get({ query: { bookId: String(bookId) } });
  if (!res.ok) throw await toApiError(res);
  return res.json();
}

export type ImportRecord = Awaited<ReturnType<typeof fetchImports>>[number];

/** A book's recent file imports, which can be undone. */
export function useImports(bookId: number) {
  return useQuery({ queryKey: keys.imports(bookId), queryFn: () => fetchImports(bookId) });
}

/** Saved CSV layouts, matched to a file by its headers. */
export function useImportLayouts() {
  return useQuery({
    queryKey: keys.layouts,
    queryFn: async () => {
      const res = await api.money["import-layouts"].$get();
      if (!res.ok) throw await toApiError(res);
      return res.json();
    },
  });
}

/** Previews (dryRun) or runs an import. A preview changes nothing, so it refreshes nothing. */
export function useImportFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ json, dryRun }: { json: BankImport; dryRun: boolean }) => {
      const res = await api.money.imports.$post({
        query: dryRun ? { dryRun: "true" } : {},
        json,
      });
      if (!res.ok) throw await toApiError(res);
      return res.json();
    },
    onSuccess: (_result, { dryRun }) => {
      if (!dryRun) void queryClient.invalidateQueries({ queryKey: keys.all });
    },
  });
}

export function useUndoImport() {
  return useMoneyMutation(async (id: number) => {
    const res = await api.money.imports[":id"].undo.$post({ param: { id: String(id) } });
    if (!res.ok) throw await toApiError(res);
    return res.json();
  });
}

// Rules

async function fetchRules(bookId: number) {
  const res = await api.money.rules.$get({ query: { bookId: String(bookId) } });
  if (!res.ok) throw await toApiError(res);
  return res.json();
}

export type Rule = Awaited<ReturnType<typeof fetchRules>>[number];

/** A book's categorization rules, in the order they're tried. */
export function useRules(bookId: number) {
  return useQuery({ queryKey: ["money", "rules", bookId], queryFn: () => fetchRules(bookId) });
}

export function useCreateRule() {
  return useMoneyMutation(async (json: RuleCreate) => {
    const res = await api.money.rules.$post({ json });
    if (!res.ok) throw await toApiError(res);
    return res.json();
  });
}

export function useMoveRule() {
  return useMoneyMutation(async ({ id, to }: { id: number; to: "earlier" | "later" }) => {
    const res = await api.money.rules[":id"].move.$post({
      param: { id: String(id) },
      json: { to },
    });
    if (!res.ok) throw await toApiError(res);
    return res.json();
  });
}

export function useDeleteRule() {
  return useMoneyMutation(async (id: number) => {
    const res = await api.money.rules[":id"].$delete({ param: { id: String(id) } });
    if (!res.ok) throw await toApiError(res);
    return res.json();
  });
}

export function useApplyRules() {
  return useMoneyMutation(async (bookId: number) => {
    const res = await api.money.rules.apply.$post({ json: { bookId } });
    if (!res.ok) throw await toApiError(res);
    return res.json();
  });
}

// Transfers

export function useCreateTransfer() {
  return useMoneyMutation(async (json: TransferCreate) => {
    const res = await api.money.transfers.$post({ json });
    if (!res.ok) throw await toApiError(res);
    return res.json();
  });
}

export function useLinkTransfer() {
  return useMoneyMutation(async (transactionIds: [number, number]) => {
    const res = await api.money.transfers.link.$post({ json: { transactionIds } });
    if (!res.ok) throw await toApiError(res);
    return res.json();
  });
}

export function useUnlinkTransfer() {
  return useMoneyMutation(async (id: number) => {
    const res = await api.money.transactions[":id"].unlink.$post({ param: { id: String(id) } });
    if (!res.ok) throw await toApiError(res);
    return res.json();
  });
}

/** Pairs in the book that look like transfers, for confirming. */
export function useTransferSuggestions(bookId: number) {
  return useQuery({
    queryKey: ["money", "transfer-suggestions", bookId],
    queryFn: async () => {
      const res = await api.money.transfers.suggestions.$get({
        query: { bookId: String(bookId) },
      });
      if (!res.ok) throw await toApiError(res);
      return res.json();
    },
  });
}

export type TransferPair = NonNullable<ReturnType<typeof useTransferSuggestions>["data"]>[number];

/** Transactions that could be the other side of this one, as a transfer. */
export function useTransferMatches(id: number | null) {
  return useQuery({
    queryKey: ["money", "transfer-matches", id ?? 0],
    queryFn: async () => {
      const res = await api.money.transactions[":id"]["transfer-matches"].$get({
        param: { id: String(id ?? 0) },
      });
      if (!res.ok) throw await toApiError(res);
      return res.json();
    },
    enabled: id !== null,
  });
}
