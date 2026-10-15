import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCents } from "../../../shared/money";
import { monthLabel } from "../../../shared/profit";

/** Chart colors come from the theme's CSS variables, so they follow the accent setting. */
function themeColor(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

type Month = { month: string; spentCents: number; lastYearCents: number };

/** Whole dollars for the axis: "$1,200". */
const axisDollars = (cents: number) => formatCents(Math.round(cents / 100) * 100);

function MonthTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: Month }>;
}) {
  const entry = payload?.[0]?.payload;
  if (!active || !entry) return null;
  return (
    <div className="rounded-tile bg-base px-3 py-2 text-sm ring-1 ring-surface-1">
      <p className="font-semibold text-fg">{monthLabel(entry.month, true)}</p>
      <p className="text-muted tabular-nums">{formatCents(entry.spentCents)} spent</p>
      <p className="text-muted tabular-nums">{formatCents(entry.lastYearCents)} a year earlier</p>
    </div>
  );
}

/** Spending each month next to the same month a year earlier. */
export function InsightsChart({ months, summary }: { months: Month[]; summary: string }) {
  const c = {
    spent: themeColor("--accent-text", "#22d3ee"),
    lastYear: themeColor("--color-surface-2", "#525d70"),
    ink: themeColor("--color-muted", "#a0afc8"),
    grid: themeColor("--color-surface-0", "#2a3444"),
  };
  return (
    <figure>
      <figcaption className="mb-3 text-sm text-muted">{summary}</figcaption>
      <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted" aria-label="Legend">
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="size-3 rounded-sm bg-accent-text" />
          This year
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="size-3 rounded-sm bg-surface-2" />A year earlier
        </li>
      </ul>
      <div aria-hidden="true" className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            accessibilityLayer={false}
            data={months}
            margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
            barGap={2}
          >
            <CartesianGrid vertical={false} stroke={c.grid} />
            <XAxis
              dataKey="month"
              tickLine={false}
              axisLine={false}
              tick={{ fill: c.ink, fontSize: 12 }}
              tickFormatter={(month: string) => monthLabel(month)}
              interval="preserveStartEnd"
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
              dataKey="lastYearCents"
              fill={c.lastYear}
              radius={[3, 3, 0, 0]}
              isAnimationActive={false}
            />
            <Bar
              dataKey="spentCents"
              fill={c.spent}
              radius={[3, 3, 0, 0]}
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
          <caption className="sr-only">Spending per month, and a year earlier</caption>
          <thead className="text-muted">
            <tr>
              <th scope="col" className="py-1 font-semibold">
                Month
              </th>
              <th scope="col" className="py-1 text-right font-semibold">
                Spent
              </th>
              <th scope="col" className="py-1 text-right font-semibold">
                A year earlier
              </th>
            </tr>
          </thead>
          <tbody className="text-fg">
            {months.map((entry) => (
              <tr key={entry.month} className="border-t border-surface-0">
                <th scope="row" className="py-1 font-normal">
                  {monthLabel(entry.month, true)}
                </th>
                <td className="py-1 text-right">{formatCents(entry.spentCents)}</td>
                <td className="py-1 text-right">{formatCents(entry.lastYearCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
