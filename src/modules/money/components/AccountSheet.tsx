import { type FormEvent, useId, useState } from "react";
import { Sheet } from "../../../client/components/Sheet";
import {
  dangerButton,
  ghostButton,
  inputClass,
  labelClass,
  primaryButton,
  secondaryButton,
  textareaClass,
} from "../../../client/components/ui";
import { ACCOUNT_KIND_LABELS, ACCOUNT_KINDS, type AccountKind } from "../../../shared/books";
import { parseSignedDollars, signedCentsToInput } from "../../../shared/money";
import { formatSigned } from "../../../shared/profit";
import { formatShortDate } from "../../tasks/dates";
import {
  type Account,
  type Book,
  useCreateAccount,
  useDeleteAccount,
  useUpdateAccount,
} from "../queries";
import { BalanceHistory } from "./BalanceHistory";

/** "new" adds an account to the book; an account edits it; null is closed. */
export type AccountTarget = "new" | Account | null;

type Draft = {
  name: string;
  kind: AccountKind;
  institution: string;
  opening: string;
  notes: string;
};

function toDraft(account: Account | null): Draft {
  return {
    name: account?.name ?? "",
    kind: account?.kind ?? "checking",
    institution: account?.institution ?? "",
    opening: account ? signedCentsToInput(account.openingBalanceCents) : "",
    notes: account?.notes ?? "",
  };
}

export function AccountSheet({
  book,
  target,
  today,
  onClose,
}: {
  book: Book;
  target: AccountTarget;
  today: string;
  onClose: () => void;
}) {
  const account = target !== null && target !== "new" ? target : null;
  return (
    <Sheet
      open={target !== null}
      onClose={onClose}
      title={account ? "Account" : "Add account"}
      description={account ? undefined : `A bank account, card, loan, or cash in ${book.name}.`}
    >
      {target === null ? null : (
        <AccountForm
          key={account?.id ?? "new"}
          book={book}
          account={account}
          today={today}
          onDone={onClose}
        />
      )}
    </Sheet>
  );
}

function AccountForm({
  book,
  account,
  today,
  onDone,
}: {
  book: Book;
  account: Account | null;
  today: string;
  onDone: () => void;
}) {
  const [draft, setDraft] = useState(() => toDraft(account));
  const [message, setMessage] = useState("");
  const [tried, setTried] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const create = useCreateAccount();
  const update = useUpdateAccount();
  const remove = useDeleteAccount();
  const ids = useId();

  const nameMissing = draft.name.trim() === "";
  const opening = draft.opening.trim() === "" ? 0 : parseSignedDollars(draft.opening);
  const openingInvalid = opening === null;
  const blocked = nameMissing || openingInvalid;
  const error = create.error ?? update.error ?? remove.error;
  const owes = draft.kind === "credit_card" || draft.kind === "loan";

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setMessage("");
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (blocked || opening === null) return;
    const fields = {
      name: draft.name.trim(),
      kind: draft.kind,
      institution: draft.institution.trim(),
      openingBalanceCents: opening,
      notes: draft.notes,
    };
    if (!account) {
      create.mutate({ bookId: book.id, ...fields }, { onSuccess: onDone });
      return;
    }
    update.mutate(
      { id: account.id, patch: fields },
      {
        onSuccess: (saved) => {
          setDraft(toDraft(saved));
          setMessage("Account saved");
        },
      },
    );
  };

  return (
    <div className="space-y-8">
      {account ? (
        <div className="rounded-tile bg-base/80 p-4 ring-1 ring-surface-0/50">
          <p className="text-sm font-semibold text-muted">Balance</p>
          <p className="mt-1 text-3xl font-bold tracking-[-0.02em] text-fg tabular-nums">
            {formatSigned(account.balanceCents)}
          </p>
          <p className="mt-1 text-sm text-muted">
            {account.latestSnapshot
              ? `From the ${formatSigned(account.latestSnapshot.balanceCents)} balance on ${formatShortDate(account.latestSnapshot.date, today)}, plus any transactions after it`
              : `${formatSigned(account.openingBalanceCents)} opening balance and ${account.transactionCount} ${account.transactionCount === 1 ? "transaction" : "transactions"}`}
          </p>
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <div>
          <label htmlFor={`${ids}-name`} className={labelClass}>
            Name
          </label>
          <input
            id={`${ids}-name`}
            value={draft.name}
            onChange={(event) => set("name", event.target.value)}
            maxLength={80}
            placeholder="Everyday checking"
            aria-invalid={tried && nameMissing}
            aria-describedby={tried && nameMissing ? `${ids}-name-error` : undefined}
            className={inputClass}
          />
          {tried && nameMissing ? (
            <p id={`${ids}-name-error`} className="mt-1.5 text-sm text-danger">
              Give the account a name.
            </p>
          ) : null}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="min-w-0">
            <label htmlFor={`${ids}-kind`} className={labelClass}>
              Kind
            </label>
            <select
              id={`${ids}-kind`}
              value={draft.kind}
              onChange={(event) => set("kind", event.target.value as AccountKind)}
              className={inputClass}
            >
              {ACCOUNT_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {ACCOUNT_KIND_LABELS[kind]}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-0">
            <label htmlFor={`${ids}-institution`} className={labelClass}>
              Bank or company
            </label>
            <input
              id={`${ids}-institution`}
              value={draft.institution}
              onChange={(event) => set("institution", event.target.value)}
              maxLength={80}
              placeholder="Optional"
              className={inputClass}
            />
          </div>
        </div>
        <div>
          <label htmlFor={`${ids}-opening`} className={labelClass}>
            Opening balance
          </label>
          <input
            id={`${ids}-opening`}
            value={draft.opening}
            onChange={(event) => set("opening", event.target.value)}
            inputMode="text"
            placeholder={owes ? "-250.00" : "0.00"}
            aria-invalid={openingInvalid}
            aria-describedby={`${ids}-opening-hint`}
            className={`${inputClass} tabular-nums`}
          />
          <p
            id={`${ids}-opening-hint`}
            className={`mt-1.5 text-sm ${openingInvalid ? "text-danger" : "text-muted"}`}
          >
            {openingInvalid
              ? "Use an amount like 1250.50, with a minus sign for money owed."
              : owes
                ? "What it held before the first transaction here. Money owed is negative, like -250."
                : "What it held before the first transaction here."}
          </p>
        </div>
        <div>
          <label htmlFor={`${ids}-notes`} className={labelClass}>
            Notes
          </label>
          <textarea
            id={`${ids}-notes`}
            value={draft.notes}
            onChange={(event) => set("notes", event.target.value)}
            rows={2}
            className={textareaClass}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className={primaryButton}
            disabled={(tried && blocked) || create.isPending || update.isPending}
          >
            {account ? "Save account" : "Add account"}
          </button>
          <p role="status" className="text-sm font-semibold text-ok">
            {message}
          </p>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error.message}
          </p>
        ) : null}
      </form>

      {account ? <BalanceHistory account={account} today={today} /> : null}

      {account ? (
        <div className="space-y-3 border-t border-surface-0/70 pt-4">
          <button
            type="button"
            className={secondaryButton}
            disabled={update.isPending}
            onClick={() =>
              update.mutate(
                { id: account.id, patch: { archived: !account.archived } },
                {
                  onSuccess: () =>
                    setMessage(account.archived ? "Account restored" : "Account archived"),
                },
              )
            }
          >
            {account.archived ? "Restore account" : "Archive account"}
          </button>
          <p className="text-sm text-muted">
            {account.archived
              ? "Archived accounts stay in the totals but leave the account lists."
              : "Archive an account you've closed. Its transactions and balances stay."}
          </p>
          {account.transactionCount > 0 || account.snapshotCount > 0 ? null : confirmDelete ? (
            <div className="space-y-3 rounded-tile bg-base p-4 ring-1 ring-danger/40">
              <p className="font-semibold text-fg">Delete {account.name}? This can't be undone.</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(account.id, { onSuccess: onDone })}
                  className="inline-flex h-11 items-center rounded-full bg-danger px-5 font-bold text-crust disabled:opacity-40"
                >
                  Delete account
                </button>
                <button
                  type="button"
                  className={ghostButton}
                  onClick={() => setConfirmDelete(false)}
                >
                  Keep account
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className={`${dangerButton} -ml-4`}
              onClick={() => setConfirmDelete(true)}
            >
              Delete account
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
