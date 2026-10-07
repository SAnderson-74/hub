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
} from "../../../client/components/ui";
import { centsToInput, formatCents, parseDollars } from "../../../shared/money";
import { FUND_LABELS, FUNDS, type Fund } from "../../../shared/tithing";
import { useAllAccounts } from "../../money/queries";
import { formatShortDate } from "../../tasks/dates";
import {
  type Overview,
  type PaymentRow,
  type Suggestion,
  useClearPayment,
  useCreatePayment,
  useSetPayment,
} from "../queries";

/**
 * What the sheet is for: a new donation (optionally for income already picked), the
 * links of a donation Hub has, or a bank line that looks like one and isn't marked yet.
 */
export type PaymentTarget =
  | { kind: "new"; incomeIds?: number[] }
  | { kind: "edit"; payment: PaymentRow }
  | { kind: "mark"; suggestion: Suggestion }
  | null;

type Candidate = { id: number; date: string; payee: string; availableCents: number };

/** Income a donation can pay for: what's still owed, plus what this payment already covers. */
function candidatesFor(overview: Overview, payment: PaymentRow | null): Candidate[] {
  const byId = new Map<number, Candidate>();
  for (const row of overview.open) {
    byId.set(row.id, {
      id: row.id,
      date: row.date,
      payee: row.payee,
      availableCents: row.owedCents - row.paidCents,
    });
  }
  for (const link of payment?.links ?? []) {
    byId.set(link.incomeTransactionId, {
      id: link.incomeTransactionId,
      date: link.date,
      payee: link.payee,
      availableCents: link.owedCents - (link.paidCents - link.amountCents),
    });
  }
  return [...byId.values()]
    .filter((row) => row.availableCents > 0)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
}

export function PaymentSheet({
  target,
  overview,
  today,
  onClose,
}: {
  target: PaymentTarget;
  overview: Overview;
  today: string;
  onClose: () => void;
}) {
  const title =
    target?.kind === "new"
      ? "Record a payment"
      : target?.kind === "mark"
        ? "Mark as a donation"
        : "Payment";
  return (
    <Sheet
      open={target !== null}
      onClose={onClose}
      title={title}
      description={
        target?.kind === "new"
          ? "Adds it to Money as money out, and says which income it pays for."
          : undefined
      }
    >
      {target === null ? null : (
        <PaymentForm
          key={
            target.kind === "new"
              ? `new-${(target.incomeIds ?? []).join(",")}`
              : target.kind === "edit"
                ? `edit-${target.payment.id}`
                : `mark-${target.suggestion.id}`
          }
          target={target}
          overview={overview}
          today={today}
          onDone={onClose}
        />
      )}
    </Sheet>
  );
}

function PaymentForm({
  target,
  overview,
  today,
  onDone,
}: {
  target: Exclude<PaymentTarget, null>;
  overview: Overview;
  today: string;
  onDone: () => void;
}) {
  const ids = useId();
  const existing = target.kind === "edit" ? target.payment : null;
  const marking = target.kind === "mark" ? target.suggestion : null;
  const candidates = candidatesFor(overview, existing);
  const accounts = useAllAccounts(target.kind === "new");
  const create = useCreatePayment();
  const set = useSetPayment();
  const clear = useClearPayment();
  const [confirmClear, setConfirmClear] = useState(false);

  const preselected =
    target.kind === "new"
      ? candidates.filter((row) => (target.incomeIds ?? []).includes(row.id))
      : [];
  const [fund, setFund] = useState<Fund>(existing?.fund ?? "tithing");
  const [amount, setAmount] = useState(() =>
    preselected.length > 0
      ? centsToInput(preselected.reduce((sum, row) => sum + row.availableCents, 0))
      : "",
  );
  const [date, setDate] = useState(today);
  const [accountId, setAccountId] = useState("");
  const [memo, setMemo] = useState("");
  const [links, setLinks] = useState<Record<number, string>>(() =>
    Object.fromEntries([
      ...(existing?.links ?? []).map((link) => [
        link.incomeTransactionId,
        centsToInput(link.amountCents),
      ]),
      ...preselected.map((row) => [row.id, centsToInput(row.availableCents)]),
    ]),
  );
  const [tried, setTried] = useState(false);

  const open = (accounts.data ?? []).filter((account) => !account.archived);
  const chosenAccount = accountId || (open.length === 1 ? String(open[0]?.id) : "");
  const amountCents = existing
    ? existing.amountCents
    : marking
      ? marking.amountCents
      : parseDollars(amount);
  const linkEntries = Object.entries(links).map(([id, text]) => ({
    id: Number(id),
    cents: parseDollars(text),
  }));
  const linkedCents = linkEntries.reduce((sum, entry) => sum + (entry.cents ?? 0), 0);
  const badLink = linkEntries.some(
    (entry) =>
      entry.cents === null ||
      entry.cents === 0 ||
      entry.cents > (candidates.find((row) => row.id === entry.id)?.availableCents ?? 0),
  );
  const over = amountCents !== null && linkedCents > amountCents;
  const needsAccount = target.kind === "new" && chosenAccount === "";
  const blocked =
    amountCents === null ||
    amountCents === 0 ||
    date === "" ||
    needsAccount ||
    over ||
    (fund === "tithing" && badLink);
  const pending = create.isPending || set.isPending || clear.isPending;
  const error = create.error ?? set.error ?? clear.error;
  const showLinks = fund === "tithing" && candidates.length > 0;

  /** Spreads the payment over the oldest income first. */
  const fillOldestFirst = () => {
    let left = amountCents ?? 0;
    const next: Record<number, string> = {};
    for (const row of candidates) {
      if (left <= 0) break;
      const take = Math.min(row.availableCents, left);
      next[row.id] = centsToInput(take);
      left -= take;
    }
    setLinks(next);
  };

  const toggle = (row: Candidate, on: boolean) =>
    setLinks((current) => {
      const next = { ...current };
      if (!on) {
        delete next[row.id];
        return next;
      }
      const left = Math.max(0, (amountCents ?? 0) - linkedCents);
      // Without an amount yet, a new payment starts at what this income needs.
      next[row.id] = centsToInput(
        amountCents === null || amountCents === 0
          ? row.availableCents
          : Math.min(row.availableCents, left || row.availableCents),
      );
      return next;
    });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (blocked || amountCents === null) return;
    const linkList =
      fund === "tithing"
        ? linkEntries.map((entry) => ({
            incomeTransactionId: entry.id,
            amountCents: entry.cents ?? 0,
          }))
        : [];
    if (target.kind === "new") {
      create.mutate(
        {
          accountId: Number(chosenAccount),
          date,
          amountCents,
          fund,
          memo: memo.trim(),
          links: linkList,
        },
        { onSuccess: onDone },
      );
      return;
    }
    const id = existing?.id ?? marking?.id ?? 0;
    set.mutate({ id, json: { fund, links: linkList } }, { onSuccess: onDone });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {existing || marking ? (
        <div className="rounded-tile bg-base/80 p-4 ring-1 ring-surface-0/50">
          <p className="font-semibold break-words text-fg">
            {formatCents(existing?.amountCents ?? marking?.amountCents ?? 0)} to{" "}
            {(existing?.payee || marking?.payee) ?? "No payee"}
          </p>
          <p className="text-sm text-muted">
            {formatShortDate(existing?.date ?? marking?.date ?? today, today)} ·{" "}
            {existing?.account.name ?? marking?.account.name}
          </p>
          <Link
            to="/money"
            className="inline-flex min-h-11 items-center text-sm font-semibold text-accent-text underline-offset-4 hover:underline"
          >
            Change the date or amount in Money
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="min-w-0">
              <label htmlFor={`${ids}-amount`} className={labelClass}>
                Amount
              </label>
              <input
                id={`${ids}-amount`}
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                aria-invalid={tried && (amountCents === null || amountCents === 0)}
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
                value={date}
                onChange={(event) => setDate(event.target.value)}
                aria-invalid={tried && date === ""}
                className={`${inputClass} [color-scheme:dark]`}
              />
            </div>
          </div>
          {tried && (amountCents === null || amountCents === 0) ? (
            <p className="-mt-3 text-sm text-danger">Enter an amount like 250 or 250.50.</p>
          ) : null}
          <div>
            <label htmlFor={`${ids}-account`} className={labelClass}>
              Paid from
            </label>
            <select
              id={`${ids}-account`}
              value={chosenAccount}
              onChange={(event) => setAccountId(event.target.value)}
              aria-invalid={tried && needsAccount}
              className={inputClass}
            >
              {chosenAccount === "" ? <option value="">Pick an account</option> : null}
              {open.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.bookName}: {account.name}
                </option>
              ))}
            </select>
            {tried && needsAccount ? (
              <p className="mt-1.5 text-sm text-danger">Pick the account it came out of.</p>
            ) : null}
          </div>
        </>
      )}

      <div>
        <label htmlFor={`${ids}-fund`} className={labelClass}>
          Fund
        </label>
        <select
          id={`${ids}-fund`}
          value={fund}
          onChange={(event) => setFund(event.target.value as Fund)}
          className={inputClass}
        >
          {FUNDS.map((value) => (
            <option key={value} value={value}>
              {FUND_LABELS[value]}
            </option>
          ))}
        </select>
        {fund !== "tithing" ? (
          <p className="mt-1.5 text-sm text-muted">
            This is kept apart from tithing owed, and isn't linked to income.
          </p>
        ) : null}
      </div>

      {target.kind === "new" ? (
        <div>
          <label htmlFor={`${ids}-memo`} className={labelClass}>
            Note (optional)
          </label>
          <input
            id={`${ids}-memo`}
            value={memo}
            onChange={(event) => setMemo(event.target.value)}
            maxLength={200}
            className={inputClass}
          />
        </div>
      ) : null}

      {fund === "tithing" ? (
        <section aria-labelledby={`${ids}-links`} className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id={`${ids}-links`} className="font-semibold text-fg">
              Income this pays for
            </h3>
            {showLinks ? (
              <button
                type="button"
                className={secondaryButton}
                disabled={!amountCents}
                onClick={fillOldestFirst}
              >
                Match oldest first
              </button>
            ) : null}
          </div>
          {candidates.length === 0 ? (
            <p className="text-sm text-muted">
              No income has tithing left to pay. A payment with no links is kept as paid ahead.
            </p>
          ) : (
            <ul className="space-y-2">
              {candidates.map((row) => {
                const checked = row.id in links;
                return (
                  <li
                    key={row.id}
                    className="rounded-tile bg-base/80 px-3 ring-1 ring-surface-0/50"
                  >
                    <label className="flex min-h-14 cursor-pointer items-center gap-3 py-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => toggle(row, event.target.checked)}
                        className="size-5 shrink-0 accent-accent"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold break-words text-fg">
                          {row.payee || "No payee"}
                        </span>
                        <span className="block text-sm text-muted tabular-nums">
                          {formatShortDate(row.date, today)} · {formatCents(row.availableCents)}{" "}
                          left to pay
                        </span>
                      </span>
                    </label>
                    {checked ? (
                      <div className="pb-3">
                        <label htmlFor={`${ids}-link-${row.id}`} className="sr-only">
                          Amount for {row.payee || "this income"}
                        </label>
                        <input
                          id={`${ids}-link-${row.id}`}
                          value={links[row.id] ?? ""}
                          onChange={(event) =>
                            setLinks((current) => ({ ...current, [row.id]: event.target.value }))
                          }
                          inputMode="decimal"
                          autoComplete="off"
                          aria-invalid={
                            tried &&
                            (() => {
                              const cents = parseDollars(links[row.id] ?? "");
                              return cents === null || cents === 0 || cents > row.availableCents;
                            })()
                          }
                          className={`${inputClass} tabular-nums`}
                        />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          <p
            className={`text-sm tabular-nums ${over ? "text-danger" : "text-muted"}`}
            aria-live="polite"
          >
            {amountCents === null || amountCents === 0
              ? `${formatCents(linkedCents)} matched.`
              : over
                ? `Matched ${formatCents(linkedCents)}, which is more than the ${formatCents(amountCents)} payment. Lower an amount.`
                : `Matched ${formatCents(linkedCents)} of ${formatCents(amountCents)}${
                    linkedCents < amountCents
                      ? `. ${formatCents(amountCents - linkedCents)} isn't matched yet.`
                      : "."
                  }`}
          </p>
          {tried && badLink && !over ? (
            <p className="text-sm text-danger">
              Each matched amount must be above $0 and no more than that income has left to pay.
            </p>
          ) : null}
        </section>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className={primaryButton} disabled={(tried && blocked) || pending}>
          {target.kind === "new"
            ? "Record payment"
            : target.kind === "mark"
              ? "Mark as donation"
              : "Save payment"}
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error.message}
        </p>
      ) : null}

      {existing ? (
        confirmClear ? (
          <div className="space-y-3 rounded-tile bg-base p-4 ring-1 ring-danger/40">
            <p className="font-semibold text-fg">
              Stop counting this as a donation? The transaction stays in Money, and income it paid
              for goes back to unpaid.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={clear.isPending}
                onClick={() => clear.mutate(existing.id, { onSuccess: onDone })}
                className="inline-flex h-11 items-center rounded-full bg-danger px-5 font-bold text-crust disabled:opacity-40"
              >
                Remove donation mark
              </button>
              <button type="button" className={ghostButton} onClick={() => setConfirmClear(false)}>
                Keep it
              </button>
            </div>
          </div>
        ) : (
          <div className="border-t border-surface-0/70 pt-4">
            <button
              type="button"
              className={`${dangerButton} -ml-4`}
              onClick={() => setConfirmClear(true)}
            >
              Remove donation mark
            </button>
          </div>
        )
      ) : null}
    </form>
  );
}
