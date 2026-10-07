import { type FormEvent, useState } from "react";
import { Link } from "react-router";
import { Sheet } from "../../../client/components/Sheet";
import { primaryButton, secondaryButton } from "../../../client/components/ui";
import { formatCents } from "../../../shared/money";
import { formatShortDate } from "../../tasks/dates";
import { type IncomeRow, useSetIncome, useSettle } from "../queries";
import { TithingBadge } from "./TithingBadge";
import {
  type ChoiceDraft,
  choiceInput,
  choiceOf,
  sameChoice,
  TithingChoice,
} from "./TithingChoice";

/** Whether tithing applies to one money-in transaction, and what it's figured on. */
export function IncomeSheet({
  row,
  today,
  onPay,
  onClose,
}: {
  row: IncomeRow | null;
  today: string;
  /** Starts a payment for this income. */
  onPay: (row: IncomeRow) => void;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={row !== null}
      onClose={onClose}
      title="Tithing on income"
      description={row ? `${formatCents(row.amountCents)} from ${row.payee || "No payee"}` : ""}
    >
      {row === null ? null : (
        <IncomeForm key={row.id} row={row} today={today} onPay={onPay} onDone={onClose} />
      )}
    </Sheet>
  );
}

function IncomeForm({
  row,
  today,
  onPay,
  onDone,
}: {
  row: IncomeRow;
  today: string;
  onPay: (row: IncomeRow) => void;
  onDone: () => void;
}) {
  const saved = choiceOf(row);
  const [draft, setDraft] = useState<ChoiceDraft>(saved);
  const [tried, setTried] = useState(false);
  const set = useSetIncome();
  const settle = useSettle();
  const input = choiceInput(draft);
  const changed = !sameChoice(draft, saved);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (!input) return;
    set.mutate({ id: row.id, json: input }, { onSuccess: onDone });
  };

  return (
    <div className="space-y-6">
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <p className="text-sm text-muted">
          {formatShortDate(row.date, today)} · {row.account.name}
          {row.source ? ` · ${row.source}` : ""}
        </p>
        <TithingChoice
          draft={draft}
          onChange={setDraft}
          wholeCents={row.defaultBaseCents}
          tried={tried}
          profit={row.defaultBaseCents !== row.amountCents}
        />
        {row.status ? (
          <p>
            <TithingBadge
              status={row.status}
              owedCents={row.owedCents}
              paidCents={row.paidCents}
              settled={row.settled}
            />
          </p>
        ) : null}
        {row.applies && changed && row.paidCents > 0 ? (
          <p className="text-sm text-muted">
            Payments already matched to this income stay matched. If the tithing now owed is less
            than that, the extra counts as paid ahead.
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className={primaryButton} disabled={set.isPending || !changed}>
            Save tithing
          </button>
          {row.status && row.status !== "paid" && !changed ? (
            <button type="button" className={secondaryButton} onClick={() => onPay(row)}>
              Record a payment
            </button>
          ) : null}
          {row.applies && !changed && row.status !== null && row.status !== "paid" ? (
            <button
              type="button"
              className={secondaryButton}
              disabled={settle.isPending}
              onClick={() =>
                settle.mutate({ incomeIds: [row.id], settled: true }, { onSuccess: onDone })
              }
            >
              Mark as paid
            </button>
          ) : null}
          {row.settled && !changed ? (
            <button
              type="button"
              className={secondaryButton}
              disabled={settle.isPending}
              onClick={() =>
                settle.mutate({ incomeIds: [row.id], settled: false }, { onSuccess: onDone })
              }
            >
              Undo marked as paid
            </button>
          ) : null}
        </div>
        {row.settled ? (
          <p className="text-sm text-muted">
            Marked as paid without a payment in Hub, so nothing was added to Money.
          </p>
        ) : null}
        {(set.error ?? settle.error) ? (
          <p role="alert" className="text-sm text-danger">
            {(set.error ?? settle.error)?.message}
          </p>
        ) : null}
      </form>
      <Link
        to="/money"
        className="inline-flex min-h-11 items-center text-sm font-semibold text-accent-text underline-offset-4 hover:underline"
      >
        Open Money to edit the transaction
      </Link>
    </div>
  );
}
