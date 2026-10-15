import { Link } from "react-router";
import { Panel } from "../../../client/components/Panel";
import { ProgressBar } from "../../../client/components/ProgressBar";
import { Stat } from "../../../client/components/Stat";
import { ErrorNote, LoadingRows } from "../../../client/components/States";
import { ghostButton } from "../../../client/components/ui";
import { formatCents } from "../../../shared/money";
import { useBooks, useBudget } from "../queries";
import { storedBookId } from "../storedBook";

/** "October 2026" */
const longMonth = (month: string) =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

/** This month in the book Money last showed: what's left to spend, and money in. */
export function MoneyWidget({ today, className }: { today: string; className?: string }) {
  const books = useBooks();
  const active = (books.data ?? []).filter((book) => !book.archived);
  const chosen = storedBookId();
  const book = active.find((item) => item.id === chosen) ?? active[0] ?? null;
  const month = today.slice(0, 7);
  const budget = useBudget(book?.id ?? 0, month, book !== null);
  const totals = budget.data?.totals;

  return (
    <Panel
      title="Money this month"
      description={book ? `${book.name}, ${longMonth(month)}.` : undefined}
      action={
        <Link to="/money" className={ghostButton}>
          Open money
        </Link>
      }
      className={className}
    >
      {books.isError ? (
        <ErrorNote error={books.error} onRetry={() => void books.refetch()} />
      ) : books.isPending ? (
        <LoadingRows rows={2} />
      ) : !book ? (
        <p className="text-muted">Set up your books on the Money page to see the month here.</p>
      ) : budget.isError ? (
        <ErrorNote error={budget.error} onRetry={() => void budget.refetch()} />
      ) : !totals ? (
        <LoadingRows rows={2} />
      ) : (
        <MonthTotals totals={totals} />
      )}
    </Panel>
  );
}

function MonthTotals({
  totals,
}: {
  totals: {
    budgetedCents: number;
    spentBudgetedCents: number;
    spentUnbudgetedCents: number;
    incomeCents: number;
  };
}) {
  const spent = totals.spentBudgetedCents + totals.spentUnbudgetedCents;
  if (totals.budgetedCents === 0) {
    return (
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Spent" value={formatCents(spent)} note="No budgets this month" />
        <Stat label="Money in" value={formatCents(totals.incomeCents)} />
      </div>
    );
  }
  const left = totals.budgetedCents - totals.spentBudgetedCents;
  const over = left < 0;
  const percent = Math.min(
    100,
    Math.round((totals.spentBudgetedCents / totals.budgetedCents) * 100),
  );
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Stat
          label={over ? "Over budget" : "Left to spend"}
          value={formatCents(Math.abs(left))}
          note={`of ${formatCents(totals.budgetedCents)} budgeted`}
        />
        <Stat label="Money in" value={formatCents(totals.incomeCents)} />
      </div>
      <ProgressBar percent={percent} label="Budget spent" over={over} />
      <p className={`text-sm ${over ? "font-semibold text-danger" : "text-muted"}`}>
        {formatCents(totals.spentBudgetedCents)} spent in budgeted categories
        {over ? `, ${formatCents(-left)} over` : ""}.
        {totals.spentUnbudgetedCents > 0
          ? ` ${formatCents(totals.spentUnbudgetedCents)} more outside budgets.`
          : ""}
      </p>
    </div>
  );
}
