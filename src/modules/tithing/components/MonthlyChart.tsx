import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCents } from "../../../shared/money";
import { type MonthRow, monthlySummary, monthName } from "../../../shared/tithing";

/** Chart colors come from the theme's CSS variables, so they follow the accent setting. */
function themeColor(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/** Whole dollars for the axis: "$1,200". */
const axisDollars = (cents: number) => formatCents(Math.round(cents / 100) * 100);

function MonthTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: MonthRow }>;
}) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="rounded-tile bg-base px-3 py-2 text-sm ring-1 ring-surface-1">
      <p className="font-semibold text-fg">{monthName(row.month)}</p>
      <p className="text-muted tabular-nums">{formatCents(row.owedCents)} owed</p>
      <p className="text-muted tabular-nums">{formatCents(row.paidCents)} paid</p>
      <p className="text-muted tabular-nums">
        {row.balanceCents >= 0
          ? `${formatCents(row.balanceCents)} still owed`
          : `${formatCents(-row.balanceCents)} paid ahead`}
      </p>
    </div>
  );
}

/**
 * Tithing owed (red) and paid (green) each month, and a line for what was still owed
 * at the month's end, carrying over from earlier years. The summary and the table say
 * it in words.
 */
export function MonthlyChart({ year, months }: { year: number; months: MonthRow[] }) {
  const owed = themeColor("--color-danger", "#f38ba8");
  const paid = themeColor("--color-ok", "#a6e3a1");
  const line = themeColor("--accent-text", "#22d3ee");
  const ink = themeColor("--color-muted", "#a0afc8");
  const grid = themeColor("--color-surface-0", "#2a3444");
  return (
    <figure>
      <figcaption className="mb-3 text-sm text-muted">{monthlySummary(year, months)}</figcaption>
      <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted" aria-label="Legend">
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="size-3 rounded-sm bg-danger" />
          Owed
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="size-3 rounded-sm bg-ok" />
          Paid
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="h-0.5 w-4 rounded-full bg-accent-text" />
          Still owed at month's end
        </li>
      </ul>
      <div aria-hidden="true" className="h-60 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={months} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={grid} />
            <XAxis
              dataKey="month"
              tickLine={false}
              axisLine={false}
              tick={{ fill: ink, fontSize: 12 }}
              tickFormatter={monthName}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fill: ink, fontSize: 12 }}
              tickFormatter={axisDollars}
              width={60}
            />
            <Tooltip cursor={{ fill: grid, opacity: 0.5 }} content={<MonthTooltip />} />
            <Bar dataKey="owedCents" fill={owed} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="paidCents" fill={paid} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Line
              dataKey="balanceCents"
              type="monotone"
              stroke={line}
              strokeWidth={2}
              dot={{ r: 3, fill: line, strokeWidth: 0 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="sr-only">
        <table>
          <caption>Tithing owed and paid per month in {year}</caption>
          <thead>
            <tr>
              <th scope="col">Month</th>
              <th scope="col">Owed</th>
              <th scope="col">Paid</th>
              <th scope="col">Still owed at month's end</th>
            </tr>
          </thead>
          <tbody>
            {months.map((row) => (
              <tr key={row.month}>
                <th scope="row">{monthName(row.month)}</th>
                <td>{formatCents(row.owedCents)}</td>
                <td>{formatCents(row.paidCents)}</td>
                <td>{formatCents(row.balanceCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
