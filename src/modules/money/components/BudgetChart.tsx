import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { type BudgetMonthTotals, budgetStatus, remainingText } from "../../../shared/budget";
import { formatCents } from "../../../shared/money";
import { monthLabel } from "../../../shared/profit";

/** Chart colors come from the theme's CSS variables, so they follow the accent setting. */
function themeColor(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function colors() {
  return {
    spent: themeColor("--accent-text", "#22d3ee"),
    over: themeColor("--color-danger", "#f38ba8"),
    // The budget is a reference, not a series: a neutral track behind each bar.
    budget: themeColor("--color-surface-2", "#525d70"),
    ink: themeColor("--color-muted", "#a0afc8"),
    grid: themeColor("--color-surface-0", "#2a3444"),
    surface: themeColor("--color-mantle", "#131a25"),
  };
}

const BAR = 22;

/** Whole dollars for the axis: "$1,200". */
const axisDollars = (cents: number) => formatCents(Math.round(cents / 100) * 100);

function describe(entry: BudgetMonthTotals): string[] {
  if (entry.budgetedCents === 0) return [`${formatCents(entry.spentCents)} spent`, "No budget"];
  const status = budgetStatus(entry.budgetedCents, entry.spentCents);
  return [
    `${formatCents(entry.spentCents)} spent of ${formatCents(entry.budgetedCents)}`,
    status.over ? `Over budget by ${formatCents(-status.remainingCents)}` : remainingText(status),
  ];
}

function MonthTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: BudgetMonthTotals }>;
}) {
  const entry = payload?.[0]?.payload;
  if (!active || !entry) return null;
  return (
    <div className="rounded-tile bg-base px-3 py-2 text-sm ring-1 ring-surface-1">
      <p className="font-semibold text-fg">{monthLabel(entry.month, true)}</p>
      {describe(entry).map((line) => (
        <p key={line} className="text-muted tabular-nums">
          {line}
        </p>
      ))}
    </div>
  );
}

type Row = BudgetMonthTotals & {
  /** Spending up to the budget (all of it without one). */
  withinCents: number;
  /** Spending past the budget, stacked on top in the danger color. */
  overCents: number;
};

/**
 * Spending per month against the month's total budget, on one dollar axis. The
 * budget is a neutral track behind each bar; spending up to it is the accent color
 * and anything past it is stacked on top in the danger color, so the budget line
 * shows even in months that went over. The tooltip and table say it in words.
 */
export function BudgetHistoryChart({
  months,
  summary,
}: {
  months: BudgetMonthTotals[];
  summary: string;
}) {
  const c = colors();
  const rows: Row[] = months.map((entry) => {
    const spent = Math.max(0, entry.spentCents);
    const over = entry.budgetedCents > 0 ? Math.max(0, spent - entry.budgetedCents) : 0;
    return { ...entry, withinCents: spent - over, overCents: over };
  });
  return (
    <figure>
      <figcaption className="mb-3 text-sm text-muted">{summary}</figcaption>
      <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted" aria-label="Legend">
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="size-3 rounded-sm bg-accent-text" />
          Spent
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="size-3 rounded-sm bg-surface-2" />
          Budget
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="size-3 rounded-sm bg-danger" />
          Over budget
        </li>
      </ul>
      <div aria-hidden="true" className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
            barGap={-BAR}
            barSize={BAR}
          >
            <CartesianGrid vertical={false} stroke={c.grid} />
            <XAxis
              dataKey="month"
              tickLine={false}
              axisLine={false}
              tick={{ fill: c.ink, fontSize: 12 }}
              tickFormatter={(month: string) => monthLabel(month)}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fill: c.ink, fontSize: 12 }}
              tickFormatter={axisDollars}
              width={60}
            />
            <Tooltip cursor={{ fill: c.grid, opacity: 0.5 }} content={<MonthTooltip />} />
            <Bar
              dataKey="budgetedCents"
              fill={c.budget}
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            />
            {/* A 2px surface ring keeps the stacked parts and the track apart. */}
            <Bar
              dataKey="withinCents"
              stackId="spent"
              fill={c.spent}
              stroke={c.surface}
              strokeWidth={2}
              isAnimationActive={false}
            >
              {rows.map((entry) => (
                <Cell key={entry.month} radius={entry.overCents > 0 ? 0 : 4} />
              ))}
            </Bar>
            <Bar
              dataKey="overCents"
              stackId="spent"
              fill={c.over}
              radius={[4, 4, 0, 0]}
              stroke={c.surface}
              strokeWidth={2}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-3 text-sm">
        <summary className="min-h-11 cursor-pointer py-2 font-semibold text-fg">
          Show the numbers
        </summary>
        <table className="w-full text-left tabular-nums">
          <caption className="sr-only">Spending and budget per month</caption>
          <thead className="text-muted">
            <tr>
              <th scope="col" className="py-1 font-semibold">
                Month
              </th>
              <th scope="col" className="py-1 text-right font-semibold">
                Budget
              </th>
              <th scope="col" className="py-1 text-right font-semibold">
                Spent
              </th>
            </tr>
          </thead>
          <tbody className="text-fg">
            {months.map((entry) => {
              const over = entry.budgetedCents > 0 && entry.spentCents > entry.budgetedCents;
              return (
                <tr key={entry.month} className="border-t border-surface-0">
                  <th scope="row" className="py-1 font-normal">
                    {monthLabel(entry.month, true)}
                  </th>
                  <td className="py-1 text-right">
                    {entry.budgetedCents > 0 ? formatCents(entry.budgetedCents) : "None"}
                  </td>
                  <td className={`py-1 text-right ${over ? "text-danger" : ""}`}>
                    {formatCents(entry.spentCents)}
                    {over ? " (over)" : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
