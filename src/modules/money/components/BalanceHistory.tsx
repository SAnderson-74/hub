import { Trash2 } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { ErrorNote, LoadingRows } from "../../../client/components/States";
import { iconButton, inputClass, labelClass, secondaryButton } from "../../../client/components/ui";
import { parseSignedDollars } from "../../../shared/money";
import { formatSigned } from "../../../shared/profit";
import { formatShortDate } from "../../tasks/dates";
import { type Account, useAccountHistory, useDeleteSnapshot, useSaveSnapshot } from "../queries";

/**
 * Balances entered from statements, for accounts that aren't imported (a retirement
 * account, a loan). The account's balance is the latest one plus later transactions.
 */
export function BalanceHistory({ account, today }: { account: Account; today: string }) {
  const history = useAccountHistory(account.id);
  const save = useSaveSnapshot();
  const remove = useDeleteSnapshot();
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [tried, setTried] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const ids = useId();
  const cents = parseSignedDollars(amount);
  const invalid = cents === null;
  const owes = account.kind === "credit_card" || account.kind === "loan";

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (cents === null || !date) return;
    save.mutate(
      { accountId: account.id, json: { date, balanceCents: cents, note: note.trim() } },
      {
        onSuccess: () => {
          setAnnouncement(`Balance saved for ${formatShortDate(date, today)}`);
          setAmount("");
          setNote("");
          setTried(false);
        },
      },
    );
  };

  return (
    <section aria-labelledby={`${ids}-title`} className="space-y-4">
      <div>
        <h3 id={`${ids}-title`} className="font-semibold text-fg">
          Balance history
        </h3>
        <p className="mt-1 text-sm text-muted">
          For an account you don't import, enter the balance from a statement now and then. The
          balance is the latest entry plus any transactions after it.
        </p>
      </div>
      <form
        onSubmit={onSubmit}
        noValidate
        className="space-y-3 rounded-tile bg-base/80 p-4 ring-1 ring-surface-0/50"
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="min-w-0">
            <label htmlFor={`${ids}-date`} className={labelClass}>
              Date
            </label>
            <input
              id={`${ids}-date`}
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className={`${inputClass} [color-scheme:dark]`}
            />
          </div>
          <div className="min-w-0">
            <label htmlFor={`${ids}-balance`} className={labelClass}>
              Balance
            </label>
            <input
              id={`${ids}-balance`}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              inputMode="text"
              autoComplete="off"
              placeholder={owes ? "-1250.00" : "0.00"}
              aria-invalid={tried && invalid}
              aria-describedby={tried && invalid ? `${ids}-balance-error` : undefined}
              className={`${inputClass} tabular-nums`}
            />
          </div>
        </div>
        {tried && invalid ? (
          <p id={`${ids}-balance-error`} className="text-sm text-danger">
            Use an amount like 1250.50, with a minus sign for money owed.
          </p>
        ) : null}
        <div>
          <label htmlFor={`${ids}-note`} className={labelClass}>
            Note
          </label>
          <input
            id={`${ids}-note`}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={200}
            placeholder="Optional, like Q3 statement"
            className={inputClass}
          />
        </div>
        <button type="submit" className={secondaryButton} disabled={save.isPending}>
          Save balance
        </button>
      </form>

      {history.isPending ? (
        <LoadingRows rows={2} />
      ) : history.isError ? (
        <ErrorNote error={history.error} onRetry={() => void history.refetch()} />
      ) : history.data.snapshots.length === 0 ? (
        <p className="text-sm text-muted">No balances entered yet.</p>
      ) : (
        <ul className="divide-y divide-surface-0">
          {history.data.snapshots.map((snapshot) => (
            <li key={snapshot.id} className="flex items-center gap-2 py-1">
              <div className="min-w-0 flex-1 py-2">
                <p className="flex justify-between gap-3 text-fg">
                  <span>{formatShortDate(snapshot.date, today)}</span>
                  <span className="font-semibold tabular-nums">
                    {formatSigned(snapshot.balanceCents)}
                  </span>
                </p>
                {snapshot.note ? (
                  <p className="text-sm break-words text-muted">{snapshot.note}</p>
                ) : null}
              </div>
              <button
                type="button"
                aria-label={`Delete the balance from ${formatShortDate(snapshot.date, today)}`}
                disabled={remove.isPending}
                className={`${iconButton} hover:text-danger`}
                onClick={() =>
                  remove.mutate(snapshot.id, {
                    onSuccess: () => setAnnouncement("Balance deleted"),
                  })
                }
              >
                <Trash2 aria-hidden="true" className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {(save.error ?? remove.error) ? (
        <p role="alert" className="text-sm text-danger">
          {(save.error ?? remove.error)?.message}
        </p>
      ) : null}
      <p role="status" className="text-sm font-semibold text-ok empty:hidden">
        {announcement}
      </p>
    </section>
  );
}
