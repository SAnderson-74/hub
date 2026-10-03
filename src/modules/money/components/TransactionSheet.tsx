import { ArrowLeftRight, Package } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { Link } from "react-router";
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
import { CATEGORY_KIND_LABELS, CATEGORY_KINDS } from "../../../shared/books";
import { cardLabel, guessCard } from "../../../shared/cards";
import { centsToInput, formatCents, parseDollars } from "../../../shared/money";
import { matchRule } from "../../../shared/moneyRules";
import { formatSigned } from "../../../shared/profit";
import { formatShortDate } from "../../tasks/dates";
import {
  type Account,
  type Card,
  type Category,
  type Rule,
  type Transaction,
  useCreateTransaction,
  useCreateTransfer,
  useDeleteTransaction,
  useLinkTransfer,
  useTransferMatches,
  useUnlinkTransfer,
  useUpdateTransaction,
} from "../queries";
import { ReceiptBox } from "./ReceiptBox";
import { newPart, type PartDraft, partsOf, SplitEditor, splitProblem } from "./SplitEditor";

/** "new" adds a transaction; a transaction edits it; null is closed. */
export type TransactionTarget = "new" | Transaction | null;

/** Money out, money in, or (for new ones) a transfer between two accounts. */
type Kind = "out" | "in" | "transfer";

type Draft = {
  kind: Kind;
  amount: string;
  date: string;
  accountId: string;
  /** Where a transfer goes. */
  toAccountId: string;
  payee: string;
  categoryId: string;
  memo: string;
  /** Who a payment-app transaction was with. */
  counterparty: string;
  /** The card it was paid with, or "" for none. */
  cardId: string;
};

function toDraft(transaction: Transaction | null, accountId: number | null, today: string): Draft {
  return {
    kind: transaction && transaction.amountCents > 0 ? "in" : "out",
    amount: transaction ? centsToInput(Math.abs(transaction.amountCents)) : "",
    date: transaction?.date ?? today,
    accountId: String(transaction?.account.id ?? accountId ?? ""),
    toAccountId: "",
    payee: transaction?.payee ?? "",
    categoryId: transaction?.category ? String(transaction.category.id) : "",
    memo: transaction?.memo ?? "",
    counterparty: transaction?.counterparty ?? "",
    cardId: transaction?.card ? String(transaction.card.id) : "",
  };
}

export function TransactionSheet({
  target,
  accounts,
  cards,
  categories,
  rules,
  defaultAccountId,
  today,
  onClose,
}: {
  target: TransactionTarget;
  accounts: Account[];
  /** The book's cards, for picking which one paid. */
  cards: Card[];
  categories: Category[];
  /** The book's rules, for suggesting a category from the payee. */
  rules: Rule[];
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
      title={transaction ? (transaction.transfer ? "Transfer" : "Transaction") : "Add transaction"}
    >
      {target === null ? null : (
        <TransactionForm
          key={transaction?.id ?? "new"}
          transaction={transaction}
          accounts={accounts}
          cards={cards}
          categories={categories}
          rules={rules}
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
  cards,
  categories,
  rules,
  defaultAccountId,
  today,
  onDone,
}: {
  transaction: Transaction | null;
  accounts: Account[];
  cards: Card[];
  categories: Category[];
  rules: Rule[];
  defaultAccountId: number | null;
  today: string;
  onDone: () => void;
}) {
  const [draft, setDraft] = useState(() => {
    const initial = toDraft(transaction, defaultAccountId, today);
    if (transaction) return initial;
    // A new one starts with the account's card when that's clear, like a credit card's.
    const account = accounts.find((item) => String(item.id) === initial.accountId);
    const guess = account
      ? guessCard(
          account.kind,
          cards.filter((card) => card.account.id === account.id),
          { payee: "", memo: "", amountCents: -1 },
        )
      : null;
    return { ...initial, cardId: guess === null ? "" : String(guess) };
  });
  const [message, setMessage] = useState("");
  const [tried, setTried] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // A category picked by hand isn't replaced by a rule's suggestion.
  const [categoryTouched, setCategoryTouched] = useState(transaction?.category != null);
  const [suggested, setSuggested] = useState(false);
  // Likewise a card: a new transaction's card follows the account and payee until picked.
  const [cardTouched, setCardTouched] = useState(transaction !== null);
  // The parts, while it's split into categories; null when it isn't.
  const [parts, setParts] = useState<PartDraft[] | null>(() => partsOf(transaction));
  const wasSplit = (transaction?.splits.length ?? 0) > 0;
  const create = useCreateTransaction();
  const createTransfer = useCreateTransfer();
  const update = useUpdateTransaction();
  const remove = useDeleteTransaction();
  const unlink = useUnlinkTransfer();
  const ids = useId();

  const isTransferSide = transaction?.transfer != null;
  // The bank's own text, when the payee has been renamed since.
  const bankText =
    transaction?.bankPayee && transaction.bankPayee !== draft.payee ? transaction.bankPayee : "";
  const transferring = draft.kind === "transfer";
  const cents = parseDollars(draft.amount);
  const amountInvalid = cents === null || cents === 0;
  const dateMissing = draft.date === "";
  const accountMissing = draft.accountId === "";
  const toMissing =
    transferring && (draft.toAccountId === "" || draft.toAccountId === draft.accountId);
  const splitting = parts !== null && !transferring && !(transaction?.transfer != null);
  const blocked =
    amountInvalid ||
    dateMissing ||
    accountMissing ||
    toMissing ||
    (splitting && parts !== null && splitProblem(parts, cents) !== null);
  const error =
    create.error ?? createTransfer.error ?? update.error ?? remove.error ?? unlink.error;
  // Archived accounts and categories stay selectable only where already used.
  const accountChoices = accounts.filter(
    (account) => !account.archived || String(account.id) === draft.accountId,
  );
  const categoryChoices = categories.filter(
    (category) => !category.archived || String(category.id) === draft.categoryId,
  );
  const cardsOf = (accountId: string) =>
    cards.filter((card) => String(card.account.id) === accountId);
  const cardChoices = cardsOf(draft.accountId).filter(
    (card) => !card.archived || String(card.id) === draft.cardId,
  );

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setMessage("");
  };

  /**
   * The card a new transaction was likely paid with, the way imports guess it, unless
   * one was picked by hand. A picked card that isn't the account's is dropped.
   */
  const followCard = (next: Pick<Draft, "accountId" | "payee" | "memo" | "kind">) => {
    const choices = cardsOf(next.accountId);
    if (cardTouched) {
      if (draft.cardId && !choices.some((card) => String(card.id) === draft.cardId)) {
        setDraft((current) => ({ ...current, cardId: "" }));
      }
      return;
    }
    const account = accounts.find((item) => String(item.id) === next.accountId);
    const guess =
      account && next.kind !== "transfer"
        ? guessCard(account.kind, choices, {
            payee: next.payee,
            memo: next.memo,
            amountCents: next.kind === "in" ? 1 : -1,
          })
        : null;
    setDraft((current) => ({ ...current, cardId: guess === null ? "" : String(guess) }));
  };

  /** Fills in the category a rule gives this payee, unless one was picked by hand. */
  const suggest = (payee: string, kind: Kind) => {
    if (categoryTouched || kind === "transfer") return;
    const rule = matchRule(rules, {
      payee,
      amountCents: kind === "in" ? 1 : -1,
      counterparty: draft.counterparty,
    });
    setSuggested(rule !== null);
    setDraft((current) => ({ ...current, categoryId: rule ? String(rule.categoryId) : "" }));
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (blocked || cents === null) return;
    if (transferring) {
      createTransfer.mutate(
        {
          fromAccountId: Number(draft.accountId),
          toAccountId: Number(draft.toAccountId),
          date: draft.date,
          amountCents: cents,
          memo: draft.memo,
        },
        { onSuccess: onDone },
      );
      return;
    }
    const sign = draft.kind === "in" ? 1 : -1;
    const fields = {
      accountId: Number(draft.accountId),
      date: draft.date,
      amountCents: sign * cents,
      payee: draft.payee.trim(),
      // Split, the parts carry the categories; otherwise one category, and a split goes.
      ...(splitting && parts
        ? {
            splits: parts.map((part) => ({
              categoryId: Number(part.categoryId),
              amountCents: sign * (parseDollars(part.amount) ?? 0),
              memo: part.memo.trim(),
            })),
          }
        : {
            categoryId: isTransferSide || !draft.categoryId ? null : Number(draft.categoryId),
            ...(wasSplit ? { splits: null } : {}),
          }),
      memo: draft.memo,
      counterparty: isTransferSide ? null : draft.counterparty.trim() || null,
      ...(isTransferSide ? {} : { cardId: draft.cardId ? Number(draft.cardId) : null }),
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
          setParts(partsOf(saved));
          setMessage(isTransferSide ? "Transfer saved" : "Transaction saved");
        },
      },
    );
  };

  const kinds: Array<[Kind, string]> = transaction
    ? []
    : [
        ["out", "Money out"],
        ["in", "Money in"],
        ["transfer", "Transfer"],
      ];

  return (
    <div className="space-y-8">
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        {kinds.length > 0 ? (
          <fieldset className="min-w-0">
            <legend className="sr-only">Kind of transaction</legend>
            <div className="flex rounded-full bg-base p-1 ring-1 ring-surface-0/60">
              {kinds.map(([value, label]) => (
                <label key={value} className="relative min-w-0 flex-1">
                  <input
                    type="radio"
                    name={`${ids}-kind`}
                    value={value}
                    checked={draft.kind === value}
                    onChange={() => {
                      set("kind", value);
                      suggest(draft.payee, value);
                      followCard({ ...draft, kind: value });
                    }}
                    className="peer absolute inset-0 size-full cursor-pointer appearance-none rounded-full"
                  />
                  <span className="pointer-events-none flex h-10 items-center justify-center rounded-full px-2 text-sm font-semibold text-muted peer-checked:bg-surface-0 peer-checked:text-fg peer-focus-visible:ring-2 peer-focus-visible:ring-accent-text">
                    {label}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : !isTransferSide ? (
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
                    name={`${ids}-kind`}
                    value={value}
                    checked={draft.kind === value}
                    onChange={() => set("kind", value)}
                    className="peer absolute inset-0 size-full cursor-pointer appearance-none rounded-full"
                  />
                  <span className="pointer-events-none flex h-10 items-center justify-center rounded-full text-sm font-semibold text-muted peer-checked:bg-surface-0 peer-checked:text-fg peer-focus-visible:ring-2 peer-focus-visible:ring-accent-text">
                    {label}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        {isTransferSide && transaction?.transfer ? (
          <div className="flex items-start gap-3 rounded-tile bg-base/80 p-4 ring-1 ring-surface-0/50">
            <ArrowLeftRight aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted" />
            <div className="min-w-0">
              <p className="font-semibold text-fg tabular-nums">
                {formatCents(Math.abs(transaction.amountCents))}{" "}
                {transaction.amountCents < 0
                  ? `from ${transaction.account.name} to ${transaction.transfer.account.name}`
                  : `from ${transaction.transfer.account.name} to ${transaction.account.name}`}
              </p>
              <p className="text-sm text-muted">
                A transfer between your accounts isn't spending or income. Unlink it to change the
                amount or accounts.
              </p>
            </div>
          </div>
        ) : null}

        {transaction && transaction.resaleItems.length > 0 ? (
          <div className="flex items-start gap-3 rounded-tile bg-base/80 p-4 ring-1 ring-surface-0/50">
            <Package aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted" />
            <div className="min-w-0">
              <p className="font-semibold text-fg">Resale</p>
              <ul>
                {transaction.resaleItems.map((item) => (
                  <li key={item.id} className="text-sm text-muted">
                    {item.role === "purchase" ? "Paid for " : "Sale of "}
                    <Link
                      to={`/resale?item=${item.id}`}
                      className="inline-flex min-h-11 items-center font-semibold break-words text-accent-text underline-offset-4 hover:underline"
                    >
                      {item.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          {isTransferSide ? null : (
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
          )}
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
        {tried && amountInvalid && !isTransferSide ? (
          <p id={`${ids}-amount-error`} className="-mt-3 text-sm text-danger">
            Enter an amount like 12.50.
          </p>
        ) : null}
        {tried && dateMissing ? (
          <p className="-mt-3 text-sm text-danger">Pick the date it happened.</p>
        ) : null}

        {transferring ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {(
              [
                ["accountId", "From account"],
                ["toAccountId", "To account"],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="min-w-0">
                <label htmlFor={`${ids}-${key}`} className={labelClass}>
                  {label}
                </label>
                <select
                  id={`${ids}-${key}`}
                  value={draft[key]}
                  onChange={(event) => set(key, event.target.value)}
                  aria-invalid={tried && (key === "accountId" ? accountMissing : toMissing)}
                  className={inputClass}
                >
                  {draft[key] === "" ? <option value="">Pick an account</option> : null}
                  {accountChoices.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            {tried && toMissing ? (
              <p className="text-sm text-danger sm:col-span-2">
                Pick a different account to move the money to.
              </p>
            ) : null}
          </div>
        ) : (
          <>
            <div>
              <label htmlFor={`${ids}-payee`} className={labelClass}>
                {isTransferSide ? "Description" : draft.kind === "in" ? "From" : "Paid to"}
              </label>
              <input
                id={`${ids}-payee`}
                value={draft.payee}
                onChange={(event) => {
                  set("payee", event.target.value);
                  suggest(event.target.value, draft.kind);
                  followCard({ ...draft, payee: event.target.value });
                }}
                maxLength={200}
                placeholder={draft.kind === "in" ? "Employer or customer" : "Store or person"}
                aria-describedby={bankText ? `${ids}-bank` : undefined}
                className={inputClass}
              />
              {bankText ? (
                <p id={`${ids}-bank`} className="mt-1.5 text-sm break-words text-muted">
                  Your bank wrote “{bankText}”.
                </p>
              ) : null}
            </div>
            {isTransferSide ? null : (
              <div>
                <label htmlFor={`${ids}-person`} className={labelClass}>
                  Person (optional)
                </label>
                <input
                  id={`${ids}-person`}
                  value={draft.counterparty}
                  onChange={(event) => set("counterparty", event.target.value)}
                  maxLength={120}
                  autoComplete="off"
                  placeholder="Like John Smith"
                  aria-describedby={`${ids}-person-hint`}
                  className={inputClass}
                />
                <p id={`${ids}-person-hint`} className="mt-1.5 text-sm text-muted">
                  Who you paid, or who paid you, on Venmo, Zelle, or Cash App. Rules can look for
                  it.
                </p>
              </div>
            )}
            {isTransferSide ? null : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="min-w-0">
                  <label htmlFor={`${ids}-account`} className={labelClass}>
                    Account
                  </label>
                  <select
                    id={`${ids}-account`}
                    value={draft.accountId}
                    onChange={(event) => {
                      set("accountId", event.target.value);
                      followCard({ ...draft, accountId: event.target.value });
                    }}
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
                {splitting ? null : (
                  <div className="min-w-0">
                    <label htmlFor={`${ids}-category`} className={labelClass}>
                      Category
                    </label>
                    <select
                      id={`${ids}-category`}
                      value={draft.categoryId}
                      onChange={(event) => {
                        set("categoryId", event.target.value);
                        setCategoryTouched(true);
                        setSuggested(false);
                      }}
                      aria-describedby={suggested ? `${ids}-suggested` : undefined}
                      className={inputClass}
                    >
                      <option value="">Uncategorized</option>
                      {/* The kind's own categories first: spending for money out, income for in. */}
                      {(draft.kind === "in" ? [...CATEGORY_KINDS].reverse() : CATEGORY_KINDS).map(
                        (kind) => {
                          const options = categoryChoices.filter(
                            (category) => category.kind === kind,
                          );
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
                    {suggested ? (
                      <p id={`${ids}-suggested`} className="mt-1.5 text-sm text-muted">
                        Picked by a rule
                      </p>
                    ) : null}
                    <button
                      type="button"
                      className={`${ghostButton} -ml-4 mt-1`}
                      onClick={() => {
                        // The whole amount starts in the current category; the rest is split off it.
                        setParts([
                          newPart(draft.categoryId, cents === null ? "" : centsToInput(cents)),
                          newPart(),
                        ]);
                        setCategoryTouched(true);
                        setSuggested(false);
                      }}
                    >
                      Split into categories
                    </button>
                  </div>
                )}
                {cardChoices.length > 0 ? (
                  <div className="min-w-0">
                    <label htmlFor={`${ids}-card`} className={labelClass}>
                      Card
                    </label>
                    <select
                      id={`${ids}-card`}
                      value={draft.cardId}
                      onChange={(event) => {
                        set("cardId", event.target.value);
                        setCardTouched(true);
                      }}
                      className={inputClass}
                    >
                      <option value="">No card</option>
                      {cardChoices.map((card) => (
                        <option key={card.id} value={card.id}>
                          {cardLabel(card)}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
              </div>
            )}
            {splitting && parts ? (
              <SplitEditor
                parts={parts}
                onChange={setParts}
                categories={categories}
                kind={draft.kind === "in" ? "in" : "out"}
                totalCents={cents}
                tried={tried}
                onUnsplit={() => {
                  // Back to one category: the largest part's, if any was picked.
                  const largest = [...parts].sort(
                    (a, b) => (parseDollars(b.amount) ?? 0) - (parseDollars(a.amount) ?? 0),
                  )[0];
                  if (largest?.categoryId) set("categoryId", largest.categoryId);
                  setParts(null);
                }}
              />
            ) : null}
          </>
        )}

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
            disabled={
              (tried && blocked) || create.isPending || createTransfer.isPending || update.isPending
            }
          >
            {transferring
              ? "Add transfer"
              : transaction
                ? isTransferSide
                  ? "Save transfer"
                  : "Save transaction"
                : "Add transaction"}
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

      {transaction?.receipt ? (
        <ReceiptBox receipt={transaction.receipt} today={today} onRemoved={onDone} />
      ) : null}
      {transaction && isTransferSide ? (
        <div className="space-y-2">
          <button
            type="button"
            className={secondaryButton}
            disabled={unlink.isPending}
            onClick={() => unlink.mutate(transaction.id, { onSuccess: onDone })}
          >
            Unlink transfer
          </button>
          <p className="text-sm text-muted">
            Keeps both sides as ordinary transactions you can categorize.
          </p>
        </div>
      ) : null}
      {transaction && !isTransferSide ? (
        <TransferMatches transaction={transaction} today={today} onLinked={onDone} />
      ) : null}

      {transaction ? (
        confirmDelete ? (
          <div className="space-y-3 rounded-tile bg-base p-4 ring-1 ring-danger/40">
            <p className="font-semibold text-fg">
              {isTransferSide
                ? "Delete this transfer? Both sides go. This can't be undone."
                : "Delete this transaction? This can't be undone."}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={remove.isPending}
                onClick={() => remove.mutate(transaction.id, { onSuccess: onDone })}
                className="inline-flex h-11 items-center rounded-full bg-danger px-5 font-bold text-crust disabled:opacity-40"
              >
                {isTransferSide ? "Delete transfer" : "Delete transaction"}
              </button>
              <button type="button" className={ghostButton} onClick={() => setConfirmDelete(false)}>
                {isTransferSide ? "Keep transfer" : "Keep transaction"}
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
              {isTransferSide ? "Delete transfer" : "Delete transaction"}
            </button>
          </div>
        )
      ) : null}
    </div>
  );
}

/** The other side of a transfer, if Hub can find it: the opposite amount in another account. */
function TransferMatches({
  transaction,
  today,
  onLinked,
}: {
  transaction: Transaction;
  today: string;
  onLinked: () => void;
}) {
  const matches = useTransferMatches(transaction.id);
  const link = useLinkTransfer();
  const ids = useId();
  if (!matches.data || matches.data.length === 0) return null;
  return (
    <section aria-labelledby={`${ids}-title`} className="space-y-3">
      <h3 id={`${ids}-title`} className="font-semibold text-fg">
        Is this a transfer?
      </h3>
      <p className="text-sm text-muted">
        {matches.data.length === 1 ? "This looks like" : "These look like"} the other side. Linking
        keeps it out of spending and income.
      </p>
      <ul className="space-y-2">
        {matches.data.map((match) => (
          <li
            key={match.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-tile bg-base/80 p-3 ring-1 ring-surface-0/50"
          >
            <span className="min-w-0">
              <span className="block font-semibold break-words text-fg">
                {match.account.name}: {match.payee || "No payee"}
              </span>
              <span className="block text-sm text-muted tabular-nums">
                {formatShortDate(match.date, today)} · {formatSigned(match.amountCents)}
              </span>
            </span>
            <button
              type="button"
              className={secondaryButton}
              disabled={link.isPending}
              onClick={() => link.mutate([transaction.id, match.id], { onSuccess: onLinked })}
            >
              Link as transfer
            </button>
          </li>
        ))}
      </ul>
      {link.error ? (
        <p role="alert" className="text-sm text-danger">
          {link.error.message}
        </p>
      ) : null}
    </section>
  );
}
