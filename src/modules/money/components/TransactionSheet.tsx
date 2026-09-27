import { type FormEvent, useId, useState } from "react";
import { Sheet } from "../../../client/components/Sheet";
import {
  dangerButton,
  ghostButton,
  inputClass,
  labelClass,
  primaryButton,
  textareaClass,
} from "../../../client/components/ui";
import { CATEGORY_KIND_LABELS, CATEGORY_KINDS } from "../../../shared/books";
import { centsToInput, parseDollars } from "../../../shared/money";
import {
  type Account,
  type Category,
  type Transaction,
  useCreateTransaction,
  useDeleteTransaction,
  useUpdateTransaction,
} from "../queries";

/** "new" adds a transaction; a transaction edits it; null is closed. */
export type TransactionTarget = "new" | Transaction | null;

type Direction = "out" | "in";

type Draft = {
  direction: Direction;
  amount: string;
  date: string;
  accountId: string;
  payee: string;
  categoryId: string;
  memo: string;
};

function toDraft(transaction: Transaction | null, accountId: number | null, today: string): Draft {
  return {
    direction: transaction && transaction.amountCents > 0 ? "in" : "out",
    amount: transaction ? centsToInput(Math.abs(transaction.amountCents)) : "",
    date: transaction?.date ?? today,
    accountId: String(transaction?.account.id ?? accountId ?? ""),
    payee: transaction?.payee ?? "",
    categoryId: transaction?.category ? String(transaction.category.id) : "",
    memo: transaction?.memo ?? "",
  };
}

export function TransactionSheet({
  target,
  accounts,
  categories,
  defaultAccountId,
  today,
  onClose,
}: {
  target: TransactionTarget;
  accounts: Account[];
  categories: Category[];
  /** Where a new transaction goes unless another account is picked. */
  defaultAccountId: number | null;
  today: string;
  onClose: () => void;
}) {
  const transaction = target !== null && target !== "new" ? target : null;
  return (
    <Sheet
      open={target !== null}
      onClose={onClose}
      title={transaction ? "Transaction" : "Add transaction"}
    >
      {target === null ? null : (
        <TransactionForm
          key={transaction?.id ?? "new"}
          transaction={transaction}
          accounts={accounts}
          categories={categories}
          defaultAccountId={defaultAccountId}
          today={today}
          onDone={onClose}
        />
      )}
    </Sheet>
  );
}

function TransactionForm({
  transaction,
  accounts,
  categories,
  defaultAccountId,
  today,
  onDone,
}: {
  transaction: Transaction | null;
  accounts: Account[];
  categories: Category[];
  defaultAccountId: number | null;
  today: string;
  onDone: () => void;
}) {
  const [draft, setDraft] = useState(() => toDraft(transaction, defaultAccountId, today));
  const [message, setMessage] = useState("");
  const [tried, setTried] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const create = useCreateTransaction();
  const update = useUpdateTransaction();
  const remove = useDeleteTransaction();
  const ids = useId();

  const cents = parseDollars(draft.amount);
  const amountInvalid = cents === null || cents === 0;
  const dateMissing = draft.date === "";
  const accountMissing = draft.accountId === "";
  const blocked = amountInvalid || dateMissing || accountMissing;
  const error = create.error ?? update.error ?? remove.error;
  // Archived accounts and categories stay selectable only where already used.
  const accountChoices = accounts.filter(
    (account) => !account.archived || String(account.id) === draft.accountId,
  );
  const categoryChoices = categories.filter(
    (category) => !category.archived || String(category.id) === draft.categoryId,
  );

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setMessage("");
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (blocked || cents === null) return;
    const fields = {
      accountId: Number(draft.accountId),
      date: draft.date,
      amountCents: draft.direction === "in" ? cents : -cents,
      payee: draft.payee.trim(),
      categoryId: draft.categoryId ? Number(draft.categoryId) : null,
      memo: draft.memo,
    };
    if (!transaction) {
      create.mutate(fields, { onSuccess: onDone });
      return;
    }
    update.mutate(
      { id: transaction.id, patch: fields },
      {
        onSuccess: (saved) => {
          setDraft(toDraft(saved, null, today));
          setMessage("Transaction saved");
        },
      },
    );
  };

  return (
    <div className="space-y-8">
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <fieldset className="min-w-0">
          <legend className="sr-only">Money in or out</legend>
          <div className="flex rounded-full bg-base p-1 ring-1 ring-surface-0/60">
            {(
              [
                ["out", "Money out"],
                ["in", "Money in"],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="relative flex-1">
                <input
                  type="radio"
                  name={`${ids}-direction`}
                  value={value}
                  checked={draft.direction === value}
                  onChange={() => set("direction", value)}
                  className="peer absolute inset-0 size-full cursor-pointer appearance-none rounded-full"
                />
                <span className="pointer-events-none flex h-10 items-center justify-center rounded-full text-sm font-semibold text-muted peer-checked:bg-surface-0 peer-checked:text-fg peer-focus-visible:ring-2 peer-focus-visible:ring-accent-text">
                  {label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid grid-cols-2 gap-3">
          <div className="min-w-0">
            <label htmlFor={`${ids}-amount`} className={labelClass}>
              Amount
            </label>
            <input
              id={`${ids}-amount`}
              value={draft.amount}
              onChange={(event) => set("amount", event.target.value)}
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              aria-invalid={tried && amountInvalid}
              aria-describedby={tried && amountInvalid ? `${ids}-amount-error` : undefined}
              className={`${inputClass} tabular-nums`}
            />
          </div>
          <div className="min-w-0">
            <label htmlFor={`${ids}-date`} className={labelClass}>
              Date
            </label>
            <input
              id={`${ids}-date`}
              type="date"
              value={draft.date}
              onChange={(event) => set("date", event.target.value)}
              aria-invalid={tried && dateMissing}
              className={`${inputClass} [color-scheme:dark]`}
            />
          </div>
        </div>
        {tried && amountInvalid ? (
          <p id={`${ids}-amount-error`} className="-mt-3 text-sm text-danger">
            Enter an amount like 12.50. Choose money in or out above.
          </p>
        ) : null}
        {tried && dateMissing ? (
          <p className="-mt-3 text-sm text-danger">Pick the date it happened.</p>
        ) : null}
        <div>
          <label htmlFor={`${ids}-payee`} className={labelClass}>
            {draft.direction === "in" ? "From" : "Paid to"}
          </label>
          <input
            id={`${ids}-payee`}
            value={draft.payee}
            onChange={(event) => set("payee", event.target.value)}
            maxLength={200}
            placeholder={draft.direction === "in" ? "Employer or customer" : "Store or person"}
            className={inputClass}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="min-w-0">
            <label htmlFor={`${ids}-account`} className={labelClass}>
              Account
            </label>
            <select
              id={`${ids}-account`}
              value={draft.accountId}
              onChange={(event) => set("accountId", event.target.value)}
              aria-invalid={tried && accountMissing}
              className={inputClass}
            >
              {draft.accountId === "" ? <option value="">Pick an account</option> : null}
              {accountChoices.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
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
              value={draft.categoryId}
              onChange={(event) => set("categoryId", event.target.value)}
              className={inputClass}
            >
              <option value="">Uncategorized</option>
              {/* The direction's own kind first: spending for money out, income for in. */}
              {(draft.direction === "in" ? [...CATEGORY_KINDS].reverse() : CATEGORY_KINDS).map(
                (kind) => {
                  const options = categoryChoices.filter((category) => category.kind === kind);
                  return options.length === 0 ? null : (
                    <optgroup key={kind} label={CATEGORY_KIND_LABELS[kind]}>
                      {options.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </optgroup>
                  );
                },
              )}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor={`${ids}-memo`} className={labelClass}>
            Memo
          </label>
          <textarea
            id={`${ids}-memo`}
            value={draft.memo}
            onChange={(event) => set("memo", event.target.value)}
            rows={2}
            maxLength={2_000}
            className={textareaClass}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className={primaryButton}
            disabled={(tried && blocked) || create.isPending || update.isPending}
          >
            {transaction ? "Save transaction" : "Add transaction"}
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

      {transaction ? (
        confirmDelete ? (
          <div className="space-y-3 rounded-tile bg-base p-4 ring-1 ring-danger/40">
            <p className="font-semibold text-fg">Delete this transaction? This can't be undone.</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={remove.isPending}
                onClick={() => remove.mutate(transaction.id, { onSuccess: onDone })}
                className="inline-flex h-11 items-center rounded-full bg-danger px-5 font-bold text-crust disabled:opacity-40"
              >
                Delete transaction
              </button>
              <button type="button" className={ghostButton} onClick={() => setConfirmDelete(false)}>
                Keep transaction
              </button>
            </div>
          </div>
        ) : (
          <div className="border-t border-surface-0/70 pt-4">
            <button
              type="button"
              className={`${dangerButton} -ml-4`}
              onClick={() => setConfirmDelete(true)}
            >
              Delete transaction
            </button>
          </div>
        )
      ) : null}
    </div>
  );
}
