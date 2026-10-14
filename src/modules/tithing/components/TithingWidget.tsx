import { Link } from "react-router";
import { Panel } from "../../../client/components/Panel";
import { ErrorNote, LoadingRows } from "../../../client/components/States";
import { StatusDot } from "../../../client/components/StatusDot";
import { ghostButton } from "../../../client/components/ui";
import { formatCents } from "../../../shared/money";
import { useOverview } from "../queries";

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Unpaid tithing in red, or paid up in green, with this year's totals. */
export function TithingWidget({ className }: { className?: string }) {
  const overview = useOverview(undefined);
  const summary = overview.data?.summary;
  const unpaid = summary ? summary.unpaidCents > 0 : false;

  return (
    <Panel
      title="Tithing"
      action={
        <Link to="/tithing" className={ghostButton}>
          Open tithing
        </Link>
      }
      className={className}
    >
      {overview.isError ? (
        <ErrorNote error={overview.error} onRetry={() => void overview.refetch()} />
      ) : !summary || !overview.data ? (
        <LoadingRows rows={2} />
      ) : (
        <div className="space-y-2">
          <p className="flex items-center gap-2.5">
            <StatusDot tone={unpaid ? "danger" : "ok"} />
            <span
              className={`text-2xl font-bold tracking-[-0.02em] tabular-nums ${
                unpaid ? "text-danger" : "text-ok"
              }`}
            >
              {unpaid ? `${formatCents(summary.unpaidCents)} unpaid` : "Paid up"}
            </span>
          </p>
          <p className="text-sm text-muted">
            {unpaid
              ? `On ${count(summary.unpaidCount, "income", "incomes")}. `
              : "Nothing left to pay. "}
            In {overview.data.year}: {formatCents(summary.owedYearCents)} owed,{" "}
            {formatCents(summary.paidYearCents)} paid
            {summary.settledYearCents > 0
              ? `, ${formatCents(summary.settledYearCents)} marked as paid`
              : ""}
            .
          </p>
        </div>
      )}
    </Panel>
  );
}
