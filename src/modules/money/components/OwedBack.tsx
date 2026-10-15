import { HandCoins } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { Panel } from "../../../client/components/Panel";
import {
  ghostButton,
  inputClass,
  labelClass,
  secondaryButton,
} from "../../../client/components/ui";
import { formatCents, parseDollars } from "../../../shared/money";
import { formatSigned } from "../../../shared/profit";
import { formatShortDate } from "../../tasks/dates";
import {
  type Book,
  type Owed,
  type Transaction,
  useCreateOwed,
  useDeleteOwed,
  useMatchOwed,
  useOwed,
  useTransactionOwed,
  useUnmatchOwed,
} from "../queries";

// Money owed back: part of a spending transaction someone else will repay. Matching the
// repayment makes it a refund in the original's category and keeps it out of tithing.

/** "Jane: $60 for Pizza Place on Mar 5" */
function owedText(owed: Owed, today: string): string {
  const who = owed.who ? `${owed.who}: ` : "";
  return `${who}${formatCents(owed.amountCents)} for ${owed.original.payee || "a payment"} on ${formatShortDate(owed.original.date, today)}`;
}

/** On a transaction: who owes part of spending back, or what money in pays back. */
export function OwedBackSection({
  transaction,
  today,
  onMatched,
}: {
  transaction: Transaction;
  today: string;
  /** After matching or unmatching, which changes the transaction's category. */
  onMatched: () => void;
}) {
  const owed = useTransactionOwed(transaction.id);
  const ids = useId();
  if (!owed.data) return null;
  const { claims, repays, matches } = owed.data;
  if (transaction.amountCents < 0) {
    return (
      <section aria-labelledby={`${ids}-title`} className="space-y-3">
        <h3 id={`${ids}-title`} className="flex items-center gap-2 font-semibold text-fg">
          <HandCoins aria-hidden="true" className="size-5 text-muted" />
          Owed back
        </h3>
        {claims.length > 0 ? (
          <ul className="space-y-2">
            {claims.map((claim) => (
              <ClaimRow key={claim.id} claim={claim} today={today} />
            ))}
          </ul>
        ) : null}
        <AddClaim
          transaction={transaction}
          claimedCents={claims.reduce((sum, row) => sum + row.amountCents, 0)}
        />
      </section>
    );
  }
  if (repays.length > 0) {
    return (
      <section aria-labelledby={`${ids}-title`} className="space-y-3">
        <h3 id={`${ids}-title`} className="font-semibold text-fg">
          Pays back
        </h3>
        <ul className="space-y-2">
          {repays.map((claim) => (
            <RepaidRow key={claim.id} claim={claim} today={today} onDone={onMatched} />
          ))}
        </ul>
        <p className="text-sm text-muted">
          It counts as a refund in the spending's category and stays out of tithing.
        </p>
      </section>
    );
  }
  if (matches.length === 0) return null;
  return (
    <section aria-labelledby={`${ids}-title`} className="space-y-3">
      <h3 id={`${ids}-title`} className="font-semibold text-fg">
        Is this someone paying you back?
      </h3>
      <ul className="space-y-2">
        {matches.map((claim) => (
          <MatchRow
            key={claim.id}
            label={owedText(claim, today)}
            claimId={claim.id}
            repaymentId={transaction.id}
            onDone={onMatched}
          />
        ))}
      </ul>
    </section>
  );
}

function ClaimRow({ claim, today }: { claim: Owed; today: string }) {
  const remove = useDeleteOwed();
  const name = claim.who || "Someone";
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-tile bg-base/80 p-3 ring-1 ring-surface-0/50">
      <span className="min-w-0">
        <span className="block font-semibold break-words text-fg">
          {name}: {formatCents(claim.amountCents)}
        </span>
        <span className="block text-sm text-muted">
          {claim.repayment
            ? `Paid back ${formatShortDate(claim.repayment.date, today)}`
            : "Not paid back yet"}
        </span>
      </span>
      <button
        type="button"
        className={ghostButton}
        disabled={remove.isPending}
        aria-label={`Remove what ${name} owes`}
        onClick={() => remove.mutate(claim.id)}
      >
        Remove
      </button>
    </li>
  );
}

function AddClaim({
  transaction,
  claimedCents,
}: {
  transaction: Transaction;
  claimedCents: number;
}) {
  const ids = useId();
  const create = useCreateOwed();
  const [open, setOpen] = useState(false);
  const [who, setWho] = useState("");
  const [amount, setAmount] = useState("");
  const [tried, setTried] = useState(false);
  const [message, setMessage] = useState("");
  const room = -transaction.amountCents - claimedCents;
  const cents = parseDollars(amount);
  const bad = cents === null || cents <= 0 || cents > room;
  if (room <= 0) return null;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (bad || cents === null) return;
    create.mutate(
      { transactionId: transaction.id, amountCents: cents, who },
      {
        onSuccess: () => {
          setMessage(`Added what ${who.trim() || "they"} owe${who.trim() ? "s" : ""}`);
          setOpen(false);
          setWho("");
          setAmount("");
          setTried(false);
        },
      },
    );
  };

  if (!open) {
    return (
      <div className="space-y-1">
        <button type="button" className={secondaryButton} onClick={() => setOpen(true)}>
          Someone owes me part of this
        </button>
        <p role="status" className="text-sm font-semibold text-ok empty:hidden">
          {message}
        </p>
      </div>
    );
  }
  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="space-y-3 rounded-tile bg-base/80 p-4 ring-1 ring-surface-0/50"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${ids}-who`} className={labelClass}>
            Who
          </label>
          <input
            id={`${ids}-who`}
            value={who}
            maxLength={60}
            autoComplete="off"
            onChange={(event) => setWho(event.target.value)}
            aria-describedby={`${ids}-who-hint`}
            className={inputClass}
          />
          <p id={`${ids}-who-hint`} className="mt-1.5 text-sm text-muted">
            Helps find their repayment.
          </p>
        </div>
        <div>
          <label htmlFor={`${ids}-amount`} className={labelClass}>
            Amount owed
          </label>
          <div className="flex gap-2">
            <input
              id={`${ids}-amount`}
              value={amount}
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              onChange={(event) => setAmount(event.target.value)}
              aria-invalid={tried && bad}
              aria-describedby={`${ids}-amount-hint`}
              className={`${inputClass} tabular-nums`}
            />
            <button
              type="button"
              className={ghostButton}
              onClick={() => setAmount((Math.floor(room / 2) / 100).toFixed(2))}
            >
              Half
            </button>
          </div>
          <p
            id={`${ids}-amount-hint`}
            className={`mt-1.5 text-sm ${tried && bad ? "text-danger" : "text-muted"}`}
          >
            {tried && bad
              ? `Use an amount up to ${formatCents(room)}.`
              : `Up to ${formatCents(room)}.`}
          </p>
        </div>
      </div>
      {create.error ? (
        <p role="alert" className="text-sm text-danger">
          {create.error.message}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={secondaryButton} disabled={create.isPending}>
          Add what's owed
        </button>
        <button type="button" className={ghostButton} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function RepaidRow({ claim, today, onDone }: { claim: Owed; today: string; onDone: () => void }) {
  const unmatch = useUnmatchOwed();
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-tile bg-base/80 p-3 ring-1 ring-surface-0/50">
      <span className="min-w-0 font-semibold break-words text-fg">{owedText(claim, today)}</span>
      <button
        type="button"
        className={ghostButton}
        disabled={unmatch.isPending}
        onClick={() => unmatch.mutate(claim.id, { onSuccess: onDone })}
      >
        Unmatch
      </button>
    </li>
  );
}

function MatchRow({
  label,
  claimId,
  repaymentId,
  onDone,
  detail,
}: {
  label: string;
  claimId: number;
  repaymentId: number;
  onDone?: () => void;
  detail?: string;
}) {
  const match = useMatchOwed();
  return (
    <li className="space-y-1 rounded-tile bg-base/80 p-3 ring-1 ring-surface-0/50">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block font-semibold break-words text-fg">{label}</span>
          {detail ? <span className="block text-sm text-muted tabular-nums">{detail}</span> : null}
        </span>
        <button
          type="button"
          className={secondaryButton}
          disabled={match.isPending}
          aria-label={`Match repayment: ${label}`}
          onClick={() => match.mutate({ id: claimId, repaymentId }, { onSuccess: onDone })}
        >
          Match repayment
        </button>
      </div>
      {match.error ? (
        <p role="alert" className="text-sm text-danger">
          {match.error.message}
        </p>
      ) : null}
    </li>
  );
}

/** Everything still owed back in a book, with the payments that look like repayments. */
export function OwedPanel({ book, today }: { book: Book; today: string }) {
  const owed = useOwed(book.id);
  if (!owed.data || owed.data.open.length === 0) return null;
  const { open, openCents } = owed.data;
  return (
    <Panel
      title="Owed to you"
      description={`${formatCents(openCents)} to come back. Matching a repayment counts it as a refund, so only your share is spending.`}
    >
      <ul className="space-y-3">
        {open.map((claim) => (
          <li key={claim.id} className="space-y-2">
            <p className="font-semibold break-words text-fg">{owedText(claim, today)}</p>
            {claim.candidates.length === 0 ? (
              <p className="text-sm text-muted">No repayment found yet.</p>
            ) : (
              <ul className="space-y-2">
                {claim.candidates.map((candidate) => (
                  <MatchRow
                    key={candidate.id}
                    label={`${candidate.payee || "Money in"} on ${formatShortDate(candidate.date, today)}`}
                    detail={`${formatSigned(candidate.amountCents)} · ${candidate.account}`}
                    claimId={claim.id}
                    repaymentId={candidate.id}
                  />
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
