import { ArrowLeftRight, BookOpen, FileUp, Plus, Tags, WalletCards, Wand2 } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { PageHeader } from "../../../client/components/PageHeader";
import { Panel } from "../../../client/components/Panel";
import { ErrorNote, LoadingRows } from "../../../client/components/States";
import {
  inputClass,
  labelClass,
  primaryButton,
  secondaryButton,
} from "../../../client/components/ui";
import { useNow } from "../../../client/lib/useNow";
import { ACCOUNT_KIND_LABELS, CATEGORY_KIND_LABELS, CATEGORY_KINDS } from "../../../shared/books";
import { formatCents } from "../../../shared/money";
import { formatSigned } from "../../../shared/profit";
import { formatShortDate, localDate } from "../../tasks/dates";
import { AccountSheet, type AccountTarget } from "../components/AccountSheet";
import { BooksSheet } from "../components/BooksSheet";
import { CategoriesSheet } from "../components/CategoriesSheet";
import { ImportSheet } from "../components/ImportSheet";
import { RulesSheet } from "../components/RulesSheet";
import { TransactionSheet, type TransactionTarget } from "../components/TransactionSheet";
import { TransfersSheet } from "../components/TransfersSheet";
import {
  type Account,
  type Book,
  type Category,
  type Transaction,
  type TransactionFilters,
  useAccounts,
  useBooks,
  useCategories,
  useRules,
  useTransactions,
  useTransferSuggestions,
} from "../queries";
import { accountsSummary, netBalance } from "../summary";

const BOOK_KEY = "hub.money.book";
const PAGE_SIZE = 100;

function storedBookId(): number | null {
  try {
    return Number(localStorage.getItem(BOOK_KEY)) || null;
  } catch {
    return null;
  }
}

export function MoneyPage() {
  const books = useBooks();
  const [chosenId, setChosenId] = useState<number | null>(storedBookId);
  const [managingBooks, setManagingBooks] = useState(false);
  const active = (books.data ?? []).filter((book) => !book.archived);
  const book = active.find((item) => item.id === chosenId) ?? active[0] ?? null;
  const accounts = useAccounts(book?.id ?? null);

  const choose = (id: number) => {
    setChosenId(id);
    try {
      localStorage.setItem(BOOK_KEY, String(id));
    } catch {
      // Private browsing; the choice still applies to this visit.
    }
  };

  return (
    <>
      <PageHeader
        title="Money"
        subtitle={
          book && accounts.data ? `${book.name}: ${accountsSummary(accounts.data)}` : undefined
        }
      />
      {books.isPending ? (
        <LoadingRows rows={3} />
      ) : books.isError ? (
        <ErrorNote error={books.error} onRetry={() => void books.refetch()} />
      ) : book === null ? (
        <Panel
          title={books.data.length === 0 ? "Set up your books" : "All books are archived"}
          description={
            books.data.length === 0
              ? "A book keeps its own accounts and categories. Start with one for personal money, and add one for a business when you need it."
              : "Restore a book or add a new one to keep going."
          }
        >
          <button type="button" className={primaryButton} onClick={() => setManagingBooks(true)}>
            <Plus aria-hidden="true" className="size-5" />
            {books.data.length === 0 ? "Add a book" : "Manage books"}
          </button>
        </Panel>
      ) : (
        <BookView
          key={book.id}
          book={book}
          books={active}
          onChooseBook={choose}
          onManageBooks={() => setManagingBooks(true)}
        />
      )}
      <BooksSheet
        open={managingBooks}
        onClose={() => setManagingBooks(false)}
        onCreated={(created) => choose(created.id)}
      />
    </>
  );
}

function BookView({
  book,
  books,
  onChooseBook,
  onManageBooks,
}: {
  book: Book;
  books: Book[];
  onChooseBook: (id: number) => void;
  onManageBooks: () => void;
}) {
  const today = localDate(useNow());
  const accounts = useAccounts(book.id);
  const categories = useCategories(book.id);
  const [accountTarget, setAccountTarget] = useState<AccountTarget>(null);
  const [transactionTarget, setTransactionTarget] = useState<TransactionTarget>(null);
  const [managingCategories, setManagingCategories] = useState(false);
  const [importing, setImporting] = useState(false);
  const [managingRules, setManagingRules] = useState(false);
  const [reviewingTransfers, setReviewingTransfers] = useState(false);
  const rules = useRules(book.id);
  const suggestions = useTransferSuggestions(book.id);
  const [accountFilter, setAccountFilter] = useState<number | undefined>(undefined);

  const allAccounts = accounts.data ?? [];
  const openAccounts = allAccounts.filter((account) => !account.archived);
  // New transactions and imports go to the filtered account, or the first open one.
  const defaultAccountId =
    openAccounts.find((account) => account.id === accountFilter)?.id ?? openAccounts[0]?.id ?? null;
  // Keep sheets in step with saved changes (a new balance, a rename).
  const shownAccount =
    accountTarget === null || accountTarget === "new"
      ? accountTarget
      : (allAccounts.find((account) => account.id === accountTarget.id) ?? null);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {books.length > 1 ? (
          <fieldset className="flex min-w-0 max-w-full overflow-x-auto rounded-full bg-mantle p-1 ring-1 ring-surface-0/60">
            <legend className="sr-only">Book</legend>
            {books.map((item) => (
              <label key={item.id} className="relative shrink-0">
                <input
                  type="radio"
                  name="money-book"
                  value={item.id}
                  checked={item.id === book.id}
                  onChange={() => onChooseBook(item.id)}
                  className="peer absolute inset-0 size-full cursor-pointer appearance-none rounded-full"
                />
                <span className="pointer-events-none flex h-10 items-center rounded-full px-4 text-sm font-semibold text-muted peer-checked:bg-surface-0 peer-checked:text-fg peer-focus-visible:ring-2 peer-focus-visible:ring-accent-text">
                  {item.name}
                </span>
              </label>
            ))}
          </fieldset>
        ) : null}
        <button
          type="button"
          className={primaryButton}
          disabled={openAccounts.length === 0}
          onClick={() => setTransactionTarget("new")}
        >
          <Plus aria-hidden="true" className="size-5" />
          Add transaction
        </button>
        <button
          type="button"
          className={secondaryButton}
          disabled={openAccounts.length === 0}
          onClick={() => setImporting(true)}
        >
          <FileUp aria-hidden="true" className="size-4" />
          Import
        </button>
        <button type="button" className={secondaryButton} onClick={() => setAccountTarget("new")}>
          <WalletCards aria-hidden="true" className="size-4" />
          Add account
        </button>
        <button
          type="button"
          className={secondaryButton}
          onClick={() => setManagingCategories(true)}
        >
          <Tags aria-hidden="true" className="size-4" />
          Categories
        </button>
        <button type="button" className={secondaryButton} onClick={() => setManagingRules(true)}>
          <Wand2 aria-hidden="true" className="size-4" />
          Rules
        </button>
        <button type="button" className={secondaryButton} onClick={onManageBooks}>
          <BookOpen aria-hidden="true" className="size-4" />
          Books
        </button>
      </div>

      {accounts.isPending ? (
        <LoadingRows rows={3} />
      ) : accounts.isError ? (
        <ErrorNote error={accounts.error} onRetry={() => void accounts.refetch()} />
      ) : allAccounts.length === 0 ? (
        <Panel
          title="Add your accounts"
          description="The checking and savings accounts, cards, loans, and cash that money moves through. Start with the one you use most."
        >
          <button type="button" className={primaryButton} onClick={() => setAccountTarget("new")}>
            <Plus aria-hidden="true" className="size-5" />
            Add account
          </button>
        </Panel>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start lg:gap-6">
          <AccountsPanel accounts={allAccounts} onOpen={(account) => setAccountTarget(account)} />
          <TransactionsPanel
            book={book}
            accounts={allAccounts}
            categories={categories.data ?? []}
            today={today}
            accountFilter={accountFilter}
            onAccountFilter={setAccountFilter}
            onOpen={(transaction) => setTransactionTarget(transaction)}
            onAdd={() => setTransactionTarget("new")}
            possibleTransfers={suggestions.data?.length ?? 0}
            onReviewTransfers={() => setReviewingTransfers(true)}
          />
        </div>
      )}

      <AccountSheet book={book} target={shownAccount} onClose={() => setAccountTarget(null)} />
      <TransactionSheet
        target={transactionTarget}
        accounts={allAccounts}
        categories={categories.data ?? []}
        rules={rules.data ?? []}
        defaultAccountId={defaultAccountId}
        today={today}
        onClose={() => setTransactionTarget(null)}
      />
      <RulesSheet
        book={book}
        categories={categories.data ?? []}
        open={managingRules}
        onClose={() => setManagingRules(false)}
      />
      <TransfersSheet
        book={book}
        today={today}
        open={reviewingTransfers}
        onClose={() => setReviewingTransfers(false)}
      />
      <ImportSheet
        book={book}
        accounts={allAccounts}
        defaultAccountId={defaultAccountId}
        today={today}
        open={importing}
        onClose={() => setImporting(false)}
      />
      <CategoriesSheet
        book={book}
        open={managingCategories}
        onClose={() => setManagingCategories(false)}
      />
    </>
  );
}

function AccountsPanel({
  accounts,
  onOpen,
}: {
  accounts: Account[];
  onOpen: (account: Account) => void;
}) {
  const net = netBalance(accounts);
  return (
    <Panel title="Accounts" className="lg:col-span-4">
      <ul className="space-y-2">
        {accounts.map((account) => (
          <li key={account.id}>
            <button
              type="button"
              onClick={() => onOpen(account)}
              className="flex w-full items-start justify-between gap-3 rounded-tile bg-base/80 p-4 text-left ring-1 ring-surface-0/50 hover:ring-surface-1"
            >
              <span className="min-w-0">
                <span
                  className={`block font-semibold break-words ${account.archived ? "text-muted" : "text-fg"}`}
                >
                  {account.name}
                </span>
                <span className="block text-sm text-muted">
                  {[
                    ACCOUNT_KIND_LABELS[account.kind],
                    account.institution,
                    account.archived ? "Archived" : "",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <span className="shrink-0 font-semibold text-fg tabular-nums">
                {formatSigned(account.balanceCents)}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-4 flex items-baseline justify-between gap-3 border-t border-surface-0 pt-3 font-bold text-fg">
        <span>Net balance</span>
        <span className="tabular-nums">{formatSigned(net)}</span>
      </p>
    </Panel>
  );
}

/**
 * "Transfer to Savings", or just "Transfer" when the payee already says so (as it does
 * for transfers added in Hub).
 */
function transferLabel(transaction: Transaction): string {
  if (!transaction.transfer) return "";
  const other = transaction.transfer.account.name;
  const label = transaction.amountCents < 0 ? `Transfer to ${other}` : `Transfer from ${other}`;
  return transaction.payee === label ? "Transfer" : label;
}

/** Waits until typing pauses, so each keystroke isn't a request. */
function useDebounced<T>(value: T, ms = 250): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

function TransactionsPanel({
  book,
  accounts,
  categories,
  today,
  accountFilter,
  onAccountFilter,
  onOpen,
  onAdd,
  possibleTransfers,
  onReviewTransfers,
}: {
  book: Book;
  accounts: Account[];
  categories: Category[];
  today: string;
  accountFilter: number | undefined;
  onAccountFilter: (id: number | undefined) => void;
  onOpen: (transaction: Transaction) => void;
  onAdd: () => void;
  /** Pairs that look like transfers, waiting to be confirmed. */
  possibleTransfers: number;
  onReviewTransfers: () => void;
}) {
  const [categoryFilter, setCategoryFilter] = useState<TransactionFilters["categoryId"]>(undefined);
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim());
  // "Show more" grows the page; a new filter starts from the first page again.
  const filterKey = JSON.stringify([accountFilter, categoryFilter, q]);
  const [paging, setPaging] = useState({ key: filterKey, limit: PAGE_SIZE });
  const limit = paging.key === filterKey ? paging.limit : PAGE_SIZE;
  const filters: TransactionFilters = {
    accountId: accountFilter,
    categoryId: categoryFilter,
    q: q || undefined,
    limit,
  };
  const transactions = useTransactions(book.id, filters);
  const ids = useId();
  const filtered = accountFilter !== undefined || categoryFilter !== undefined || q !== "";

  const page = transactions.data;
  const count = (n: number) => `${n} ${n === 1 ? "transaction" : "transactions"}`;

  return (
    <Panel title="Transactions" className="lg:col-span-8">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="min-w-0">
          <label htmlFor={`${ids}-account`} className={labelClass}>
            Account
          </label>
          <select
            id={`${ids}-account`}
            value={accountFilter ?? ""}
            onChange={(event) =>
              onAccountFilter(event.target.value === "" ? undefined : Number(event.target.value))
            }
            className={inputClass}
          >
            <option value="">All accounts</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.archived ? `${account.name} (archived)` : account.name}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-0">
          <label htmlFor={`${ids}-category`} className={labelClass}>
            Category
          </label>
          <select
            id={`${ids}-category`}
            value={categoryFilter ?? ""}
            onChange={(event) => {
              const value = event.target.value;
              setCategoryFilter(
                value === ""
                  ? undefined
                  : value === "none" || value === "transfer"
                    ? value
                    : Number(value),
              );
            }}
            className={inputClass}
          >
            <option value="">All categories</option>
            <option value="none">Uncategorized</option>
            <option value="transfer">Transfers</option>
            {CATEGORY_KINDS.map((kind) => {
              const options = categories.filter((category) => category.kind === kind);
              return options.length === 0 ? null : (
                <optgroup key={kind} label={CATEGORY_KIND_LABELS[kind]}>
                  {options.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        </div>
        <div className="min-w-0">
          <label htmlFor={`${ids}-search`} className={labelClass}>
            Search
          </label>
          <input
            id={`${ids}-search`}
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Payee or memo"
            autoComplete="off"
            className={inputClass}
          />
        </div>
      </div>

      {possibleTransfers > 0 ? (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-tile bg-base/80 p-4 ring-1 ring-surface-0/50">
          <p className="flex min-w-0 items-start gap-2 text-fg">
            <ArrowLeftRight aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted" />
            {possibleTransfers === 1
              ? "1 pair looks like a transfer between your accounts."
              : `${possibleTransfers} pairs look like transfers between your accounts.`}
          </p>
          <button type="button" className={secondaryButton} onClick={onReviewTransfers}>
            Review transfers
          </button>
        </div>
      ) : null}

      <div className="mt-5">
        {transactions.isPending ? (
          <LoadingRows rows={4} />
        ) : transactions.isError ? (
          <ErrorNote error={transactions.error} onRetry={() => void transactions.refetch()} />
        ) : page && page.total === 0 ? (
          filtered ? (
            <p className="text-muted">
              No transactions match. Try another account, category, or word.
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-muted">
                No transactions yet. Add one when money comes in or goes out.
              </p>
              <button type="button" className={secondaryButton} onClick={onAdd}>
                <Plus aria-hidden="true" className="size-4" />
                Add transaction
              </button>
            </div>
          )
        ) : page ? (
          <>
            <p className="mb-3 text-sm text-muted tabular-nums">
              {count(page.total)} · {formatCents(page.inCents)} in · {formatCents(-page.outCents)}{" "}
              out
              {page.transferCount > 0
                ? ` · ${page.transferCount} ${page.transferCount === 1 ? "transfer" : "transfers"} not counted`
                : ""}
            </p>
            <ul className="divide-y divide-surface-0">
              {page.transactions.map((transaction) => (
                <li key={transaction.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(transaction)}
                    className="flex min-h-14 w-full items-start justify-between gap-3 rounded-control px-2 py-3 text-left hover:bg-surface-0/40"
                  >
                    <span className="min-w-0">
                      <span
                        className={`block font-semibold break-words ${transaction.payee ? "text-fg" : "text-muted"}`}
                      >
                        {transaction.payee || "No payee"}
                      </span>
                      <span className="block text-sm text-muted">
                        {[
                          formatShortDate(transaction.date, today),
                          transaction.transfer
                            ? transferLabel(transaction)
                            : (transaction.category?.name ?? "Uncategorized"),
                          accountFilter === undefined ? transaction.account.name : "",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 font-semibold tabular-nums ${
                        transaction.amountCents > 0 && !transaction.transfer ? "text-ok" : "text-fg"
                      }`}
                    >
                      {transaction.amountCents > 0
                        ? `+${formatCents(transaction.amountCents)}`
                        : formatSigned(transaction.amountCents)}
                      <span className="sr-only">
                        {transaction.amountCents > 0 ? " in" : " out"}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {page.transactions.length < page.total ? (
              <button
                type="button"
                className={`${secondaryButton} mt-4`}
                disabled={transactions.isFetching}
                onClick={() => setPaging({ key: filterKey, limit: limit + PAGE_SIZE })}
              >
                Show more
              </button>
            ) : null}
          </>
        ) : null}
      </div>
    </Panel>
  );
}
