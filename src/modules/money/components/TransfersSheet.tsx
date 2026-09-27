import { ArrowRight } from "lucide-react";
import { useId, useState } from "react";
import { Sheet } from "../../../client/components/Sheet";
import { ErrorNote, LoadingRows } from "../../../client/components/States";
import { secondaryButton } from "../../../client/components/ui";
import { formatCents } from "../../../shared/money";
import { formatShortDate } from "../../tasks/dates";
import { type Book, type TransferPair, useLinkTransfer, useTransferSuggestions } from "../queries";

/**
 * Pairs that look like money moving between two of the book's accounts, usually from
 * imports. Linking one keeps it out of spending and income.
 */
export function TransfersSheet({
  book,
  today,
  open,
  onClose,
}: {
  book: Book;
  today: string;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Possible transfers"
      description="The same amount left one account and arrived in another within a few days. If a pair isn't a transfer, give either one a category and it won't show here."
    >
      {open ? <Pairs book={book} today={today} /> : null}
    </Sheet>
  );
}

function Pairs({ book, today }: { book: Book; today: string }) {
  const suggestions = useTransferSuggestions(book.id);
  const link = useLinkTransfer();
  const [announcement, setAnnouncement] = useState("");
  const ids = useId();

  return (
    <div className="space-y-4">
      {suggestions.isPending ? (
        <LoadingRows rows={2} />
      ) : suggestions.isError ? (
        <ErrorNote error={suggestions.error} onRetry={() => void suggestions.refetch()} />
      ) : suggestions.data.length === 0 ? (
        <p className="text-muted">Nothing left to review.</p>
      ) : (
        <ul className="space-y-3">
          {suggestions.data.map((pair: TransferPair) => (
            <li
              key={`${pair.from.id}-${pair.to.id}`}
              aria-labelledby={`${ids}-${pair.from.id}`}
              className="space-y-3 rounded-tile bg-base/80 p-4 ring-1 ring-surface-0/50"
            >
              <p
                id={`${ids}-${pair.from.id}`}
                className="flex flex-wrap items-center gap-x-2 font-semibold text-fg tabular-nums"
              >
                {formatCents(-pair.from.amountCents)} from {pair.from.account.name}
                <ArrowRight aria-hidden="true" className="size-4 text-muted" />
                <span className="sr-only">to</span>
                {pair.to.account.name}
              </p>
              <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                {[pair.from, pair.to].map((side) => (
                  <div key={side.id} className="min-w-0">
                    <dt className="text-muted">
                      {side.account.name}, {formatShortDate(side.date, today)}
                    </dt>
                    <dd className="break-words text-fg">{side.payee || "No payee"}</dd>
                  </div>
                ))}
              </dl>
              <button
                type="button"
                className={secondaryButton}
                disabled={link.isPending}
                onClick={() =>
                  link.mutate([pair.from.id, pair.to.id], {
                    onSuccess: () =>
                      setAnnouncement(
                        `Linked ${formatCents(-pair.from.amountCents)} from ${pair.from.account.name} to ${pair.to.account.name}`,
                      ),
                  })
                }
              >
                Link as transfer
              </button>
            </li>
          ))}
        </ul>
      )}
      {link.error ? (
        <p role="alert" className="text-sm text-danger">
          {link.error.message}
        </p>
      ) : null}
      <p role="status" className="text-sm font-semibold text-ok empty:hidden">
        {announcement}
      </p>
    </div>
  );
}
