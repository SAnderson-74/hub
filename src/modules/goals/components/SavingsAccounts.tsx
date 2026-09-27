import { useId } from "react";
import { ErrorNote, LoadingRows } from "../../../client/components/States";
import { formatSigned } from "../../../shared/profit";
import { useAllAccounts } from "../../money/queries";

/**
 * Money accounts a savings goal counts. With any chosen, "saved so far" is their
 * combined balance, so the goal follows the money without typing it in.
 */
export function SavingsAccounts({
  chosen,
  onChange,
}: {
  chosen: number[];
  onChange: (accountIds: number[]) => void;
}) {
  const accounts = useAllAccounts();
  const ids = useId();
  if (accounts.isPending) return <LoadingRows rows={2} />;
  if (accounts.isError) {
    return <ErrorNote error={accounts.error} onRetry={() => void accounts.refetch()} />;
  }
  // Archived accounts stay listed only while this goal counts them.
  const shown = accounts.data.filter((account) => !account.archived || chosen.includes(account.id));
  const books = [...new Set(shown.map((account) => account.bookName))];
  const total = accounts.data
    .filter((account) => chosen.includes(account.id))
    .reduce((sum, account) => sum + account.balanceCents, 0);

  return (
    <fieldset className="min-w-0 space-y-3" aria-describedby={`${ids}-hint`}>
      <legend className="mb-1.5 text-sm font-semibold text-muted">Count money in accounts</legend>
      <p id={`${ids}-hint`} className="text-sm text-muted">
        {chosen.length === 0
          ? "Choose accounts to follow their balance instead of typing the amount saved."
          : `Saved so far: ${formatSigned(total)}, the chosen accounts' balance. It updates as money moves.`}
      </p>
      {shown.length === 0 ? (
        <p className="text-sm text-muted">Add accounts on the Money page to link them here.</p>
      ) : (
        books.map((book) => (
          <div key={book} className="space-y-1">
            {books.length > 1 ? <p className="text-sm font-semibold text-faint">{book}</p> : null}
            {shown
              .filter((account) => account.bookName === book)
              .map((account) => (
                <label
                  key={account.id}
                  className="flex min-h-11 cursor-pointer items-center gap-3 rounded-control px-1 text-fg hover:bg-surface-0/40"
                >
                  <input
                    type="checkbox"
                    checked={chosen.includes(account.id)}
                    onChange={(event) =>
                      onChange(
                        event.target.checked
                          ? [...chosen, account.id]
                          : chosen.filter((id) => id !== account.id),
                      )
                    }
                    className="size-5 shrink-0 accent-accent"
                  />
                  <span className="min-w-0 flex-1 break-words">
                    {account.name}
                    {account.archived ? <span className="text-muted"> (archived)</span> : null}
                  </span>
                  <span className="shrink-0 text-sm text-muted tabular-nums">
                    {formatSigned(account.balanceCents)}
                  </span>
                </label>
              ))}
          </div>
        ))
      )}
    </fieldset>
  );
}
