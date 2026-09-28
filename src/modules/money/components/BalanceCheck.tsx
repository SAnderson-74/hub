import { useState } from "react";
import { secondaryButton } from "../../../client/components/ui";
import { formatCents } from "../../../shared/money";
import { formatSigned } from "../../../shared/profit";
import { formatLongDate } from "../../tasks/dates";
import { useSaveSnapshot } from "../queries";

type Check = { date: string; bankCents: number; hubCents: number };

/**
 * The bank's balance from the file next to Hub's. After an import, a gap can be
 * closed by recording the bank's balance, which Hub then counts from.
 */
export function BalanceCheck({
  check,
  imported,
  accountId,
  fileName,
}: {
  check: Check;
  /** false in the preview, where it says what Hub will have. */
  imported: boolean;
  accountId: number;
  fileName: string;
}) {
  const save = useSaveSnapshot();
  const [saved, setSaved] = useState(false);
  const day = formatLongDate(check.date);
  const gap = check.hubCents - check.bankCents;
  const hub = imported ? "Hub has" : "After this import, Hub will have";

  if (gap === 0) {
    return (
      <p className="text-sm font-semibold text-ok">
        {hub} {formatSigned(check.hubCents)} at the end of {day}, matching your bank's file.
      </p>
    );
  }
  return (
    <div className="space-y-2 rounded-tile bg-base p-4 ring-1 ring-warn/40">
      <p className="text-fg">
        <span className="font-semibold text-warn">
          {formatCents(Math.abs(gap))} {gap < 0 ? "less" : "more"} than your bank.{" "}
        </span>
        Your bank's file says {formatSigned(check.bankCents)} on {day}. {hub}{" "}
        {formatSigned(check.hubCents)} at the end of that day.
      </p>
      <p className="text-sm text-muted">
        Usually a transaction missing from Hub or entered twice, or a starting balance that's off.
        Look for one of {formatCents(Math.abs(gap))} first.
        {imported ? " Or use the bank's balance, and Hub counts from it from now on." : ""}
      </p>
      {imported ? (
        saved ? (
          <p role="status" className="text-sm font-semibold text-ok">
            Hub now counts from your bank's balance on {day}.
          </p>
        ) : (
          <button
            type="button"
            className={secondaryButton}
            disabled={save.isPending}
            onClick={() =>
              save.mutate(
                {
                  accountId,
                  json: {
                    date: check.date,
                    balanceCents: check.bankCents,
                    note: `From ${fileName}`.slice(0, 200),
                  },
                },
                { onSuccess: () => setSaved(true) },
              )
            }
          >
            Use the bank's balance
          </button>
        )
      ) : null}
      {save.error ? (
        <p role="alert" className="text-sm text-danger">
          {save.error.message}
        </p>
      ) : null}
    </div>
  );
}
