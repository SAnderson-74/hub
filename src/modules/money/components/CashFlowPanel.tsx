import { useState } from "react";
import { Panel } from "../../../client/components/Panel";
import { ErrorNote, LoadingRows } from "../../../client/components/States";
import {
  CASH_FLOW_PERIODS,
  type CashFlowPeriod,
  flowColumns,
  flowSummary,
  periodLabel,
} from "../../../shared/cashFlow";
import { type Book, useCashFlow } from "../queries";
import { CashFlowChart } from "./CashFlowChart";

const PERIOD_LABELS: Record<CashFlowPeriod, string> = {
  1: "Month",
  3: "3 months",
  12: "12 months",
};

/** Where the book's money came from and went, for the month shown or the months to it. */
export function CashFlowPanel({ book, month }: { book: Book; month: string }) {
  const [months, setMonths] = useState<CashFlowPeriod>(1);
  const flow = useCashFlow(book.id, month, months);
  const columns = flow.data ? flowColumns(flow.data) : null;

  return (
    <Panel
      title="Cash flow"
      description="Where money came from and where it went. Transfers between accounts aren't counted."
      className="lg:col-span-12"
    >
      <fieldset className="mb-4 flex w-fit rounded-full bg-base p-1 ring-1 ring-surface-0/60">
        <legend className="sr-only">Period</legend>
        {CASH_FLOW_PERIODS.map((value) => (
          <label key={value} className="relative">
            <input
              type="radio"
              name={`cash-flow-${book.id}`}
              value={value}
              checked={months === value}
              onChange={() => setMonths(value)}
              className="peer absolute inset-0 size-full cursor-pointer appearance-none rounded-full"
            />
            <span className="pointer-events-none flex h-10 items-center rounded-full px-3 text-sm font-semibold whitespace-nowrap text-muted peer-checked:bg-surface-0 peer-checked:text-fg peer-focus-visible:ring-2 peer-focus-visible:ring-accent-text">
              {PERIOD_LABELS[value]}
            </span>
          </label>
        ))}
      </fieldset>
      {flow.isPending ? (
        <LoadingRows rows={4} />
      ) : flow.isError ? (
        <ErrorNote error={flow.error} onRetry={() => void flow.refetch()} />
      ) : columns ? (
        <div className={flow.isPlaceholderData ? "opacity-60" : ""}>
          <CashFlowChart
            flow={flow.data}
            columns={columns}
            summary={flowSummary(columns, periodLabel(month, months))}
          />
        </div>
      ) : null}
    </Panel>
  );
}
