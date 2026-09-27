import { Link2, Search, X } from "lucide-react";
import { useDeferredValue, useId, useState } from "react";
import { LoadingRows } from "../../../client/components/States";
import { iconButton, inputClass, secondaryButton } from "../../../client/components/ui";
import { formatCents } from "../../../shared/money";
import { formatSigned } from "../../../shared/profit";
import type { LinkRole } from "../../../shared/resale";
import { useAllAccounts } from "../../money/queries";
import { formatShortDate, localDate } from "../../tasks/dates";
import {
  type Item,
  type ItemTransaction,
  type TransactionMatch,
  useLinkTransaction,
  useRecordTransaction,
  useTransactionMatches,
  useUnlinkTransaction,
} from "../queries";

const ROLE_TITLES: Record<LinkRole, string> = { purchase: "Purchase", sale: "Sale" };

/** "Card · Personal", or just the account when there's one book. */
function where(account: ItemTransaction["account"], showBook: boolean): string {
  return showBook ? `${account.name} · ${account.bookName}` : account.name;
}

/**
 * The item's purchase and sale as they appear in Money: linked transactions, likely
 * matches to link, and a way to add the money when no bank file will bring it in.
 */
export function ItemTransactions({ item }: { item: Item }) {
  const headingId = useId();
  const accounts = useAllAccounts();
  const unlink = useUnlinkTransaction();
  const [picking, setPicking] = useState<LinkRole | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const today = localDate();
  const books = new Set((accounts.data ?? []).map((account) => account.bookId));
  const showBook = books.size > 1;
  const sold = item.status === "sold" || item.saleCents !== null || item.soldOn !== null;
  const roles: LinkRole[] =
    sold || item.transactions.some((row) => row.role === "sale")
      ? ["purchase", "sale"]
      : ["purchase"];
  const noAccounts = accounts.isSuccess && accounts.data.length === 0;

  return (
    <section aria-labelledby={headingId} className="border-t border-surface-0/70 pt-6">
      <h3 id={headingId} className="font-semibold text-fg">
        In Money
      </h3>
      <p className="text-sm text-muted">
        {noAccounts
          ? "Add an account in Money to link what you paid and were paid."
          : "Link what you paid and were paid to their transactions, so your books and this item agree."}
      </p>

      {noAccounts
        ? null
        : roles.map((role) => {
            const linked = item.transactions.filter((row) => row.role === role);
            return (
              <div key={role} className="mt-4">
                <h4 className="text-sm font-semibold text-muted">{ROLE_TITLES[role]}</h4>
                {linked.length === 0 ? (
                  <p className="mt-1 text-sm text-faint">Not linked yet.</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {linked.map((row) => (
                      <li
                        key={row.id}
                        className="flex items-center gap-2 rounded-tile bg-base/80 py-1 pr-1 pl-4 ring-1 ring-surface-0/50"
                      >
                        <span className="min-w-0 flex-1 py-2">
                          <span className="block font-semibold break-words text-fg">
                            {row.payee || "No payee"}
                          </span>
                          <span className="block text-sm text-muted">
                            {formatShortDate(row.date, today)} · {where(row.account, showBook)}
                          </span>
                        </span>
                        <span className="shrink-0 font-semibold text-fg tabular-nums">
                          {formatSigned(row.amountCents)}
                        </span>
                        <button
                          type="button"
                          className={iconButton}
                          aria-label={`Unlink ${row.payee || "the transaction"}, ${formatSigned(row.amountCents)}`}
                          disabled={unlink.isPending}
                          onClick={() =>
                            unlink.mutate(
                              { itemId: item.id, transactionId: row.id },
                              { onSuccess: () => setAnnouncement("Transaction unlinked") },
                            )
                          }
                        >
                          <X aria-hidden="true" className="size-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {picking === role ? (
                  <Picker
                    item={item}
                    role={role}
                    showBook={showBook}
                    accounts={accounts.data ?? []}
                    onDone={(message) => {
                      setPicking(null);
                      setAnnouncement(message);
                    }}
                    onCancel={() => setPicking(null)}
                  />
                ) : (
                  <button
                    type="button"
                    className={`${secondaryButton} mt-2`}
                    onClick={() => {
                      setPicking(role);
                      setAnnouncement("");
                    }}
                  >
                    <Link2 aria-hidden="true" className="size-4" />
                    {role === "purchase" ? "Link the purchase" : "Link the sale"}
                  </button>
                )}
              </div>
            );
          })}
      {unlink.error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {unlink.error.message}
        </p>
      ) : null}
      <p role="status" className="mt-2 text-sm font-semibold text-ok empty:hidden">
        {announcement}
      </p>
    </section>
  );
}

type Account = NonNullable<ReturnType<typeof useAllAccounts>["data"]>[number];

function Picker({
  item,
  role,
  showBook,
  accounts,
  onDone,
  onCancel,
}: {
  item: Item;
  role: LinkRole;
  showBook: boolean;
  accounts: Account[];
  onDone: (message: string) => void;
  onCancel: () => void;
}) {
  const ids = useId();
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search.trim());
  const matches = useTransactionMatches(item.id, role, q, true);
  const link = useLinkTransaction();
  const record = useRecordTransaction();
  const open = accounts.filter((account) => !account.archived);
  // The first open account until one is chosen, even if the list loaded after this opened.
  const [chosenId, setChosenId] = useState<number | null>(null);
  const accountId = chosenId ?? open[0]?.id ?? "";
  const today = localDate();
  const cents = role === "purchase" ? item.purchaseCents : item.saleCents;
  const date = role === "purchase" ? item.purchasedOn : item.soldOn;
  const canRecord = cents !== null && cents > 0 && date !== null;
  const error = link.error ?? record.error;
  const what = role === "purchase" ? "purchase" : "sale";

  const choose = (match: TransactionMatch) =>
    link.mutate(
      { itemId: item.id, json: { transactionId: match.id, role } },
      { onSuccess: () => onDone(`Linked to ${match.payee || "the transaction"}`) },
    );

  return (
    <div className="mt-2 space-y-3 rounded-tile bg-base/80 p-4 ring-1 ring-surface-0/50">
      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-faint"
        />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          maxLength={100}
          placeholder="Search payees and memos"
          aria-label={`Search transactions for the ${what}`}
          className={`${inputClass} pl-10`}
        />
      </div>
      <p className="text-sm text-muted">
        {q
          ? "Matches from any date, closest amount first."
          : date
            ? `Money ${role === "purchase" ? "out" : "in"} within a month of ${formatShortDate(date, today)}, closest amount first.`
            : cents !== null
              ? `Money ${role === "purchase" ? "out" : "in"} of exactly ${formatCents(cents)}.`
              : `Recent money ${role === "purchase" ? "out" : "in"}.`}
      </p>

      {matches.isPending ? (
        <LoadingRows rows={2} />
      ) : matches.isError ? (
        <p role="alert" className="text-sm text-danger">
          {matches.error.message}
        </p>
      ) : matches.data.length === 0 ? (
        <p className="text-sm text-muted">
          No transactions match. Search for one, or add the {what} to Money below.
        </p>
      ) : (
        <ul className="divide-y divide-surface-0" aria-label="Matching transactions">
          {matches.data.map((match) => (
            <li key={match.id}>
              <button
                type="button"
                disabled={link.isPending}
                onClick={() => choose(match)}
                aria-label={`Link ${match.payee || "no payee"}, ${formatSigned(match.amountCents)} on ${formatShortDate(match.date, today)}, ${where(match.account, showBook)}`}
                className="flex min-h-11 w-full items-center gap-3 rounded-control py-2 text-left hover:bg-surface-0/60 disabled:opacity-50"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold break-words text-fg">
                    {match.payee || "No payee"}
                  </span>
                  <span className="block text-sm text-muted">
                    {[
                      formatShortDate(match.date, today),
                      where(match.account, showBook),
                      match.linkedItems.length > 0
                        ? `Also for ${match.linkedItems.map((other) => other.title).join(", ")}`
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  {match.exact ? (
                    <span className="block text-sm font-semibold text-ok">Exact amount</span>
                  ) : null}
                </span>
                <span className="shrink-0 font-semibold text-fg tabular-nums">
                  {formatSigned(match.amountCents)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="border-t border-surface-0 pt-3">
        <p className="text-sm text-muted">
          {canRecord
            ? `Paid in cash, or not in a bank file? Add the ${what} to an account instead: ${formatCents(cents)} on ${formatShortDate(date, today)}.`
            : role === "purchase"
              ? "To add it to Money instead, first enter what you paid and the date you bought it."
              : "To add it to Money instead, first enter the sale price and the date it sold."}
        </p>
        {canRecord && open.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-2">
            <label htmlFor={`${ids}-account`} className="sr-only">
              Account to add it to
            </label>
            <select
              id={`${ids}-account`}
              value={accountId}
              onChange={(event) => setChosenId(Number(event.target.value))}
              className={`${inputClass} min-w-0 flex-1`}
            >
              {open.map((account) => (
                <option key={account.id} value={account.id}>
                  {showBook ? `${account.name} (${account.bookName})` : account.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={secondaryButton}
              disabled={accountId === "" || record.isPending}
              onClick={() => {
                if (accountId === "") return;
                record.mutate(
                  { itemId: item.id, json: { role, accountId } },
                  { onSuccess: () => onDone(`The ${what} was added to Money and linked`) },
                );
              }}
            >
              Add to Money
            </button>
          </div>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error.message}
        </p>
      ) : null}
      <button type="button" className={`${secondaryButton} w-full`} onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}
