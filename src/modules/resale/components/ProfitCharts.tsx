import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCents } from "../../../shared/money";
import {
  formatMargin,
  formatSigned,
  type MonthProfit,
  monthLabel,
  type PlatformProfit,
} from "../../../shared/profit";

/** Chart colors come from the theme's CSS variables, so they follow the accent setting. */
function themeColor(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function colors() {
  return {
    gain: themeColor("--accent-text", "#22d3ee"),
    loss: themeColor("--color-danger", "#f38ba8"),
    ink: themeColor("--color-muted", "#a0afc8"),
    grid: themeColor("--color-surface-0", "#2a3444"),
    baseline: themeColor("--color-surface-2", "#525d70"),
  };
}

/** Whole dollars for axes: "$1,200", "-$40". */
const axisDollars = (cents: number) => formatSigned(Math.round(cents / 100) * 100);

function Tip({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="rounded-tile bg-base px-3 py-2 text-sm ring-1 ring-surface-1">
      <p className="font-semibold text-fg">{title}</p>
      {lines.map((line) => (
        <p key={line} className="text-muted tabular-nums">
          {line}
        </p>
      ))}
    </div>
  );
}

const sales = (count: number) => `${count} ${count === 1 ? "sale" : "sales"}`;

function MonthTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: MonthProfit }>;
}) {
  const datum = payload?.[0]?.payload;
  if (!active || !datum) return null;
  return (
    <Tip
      title={monthLabel(datum.month, true)}
      lines={
        datum.sales === 0
          ? ["No sales"]
          : [
              `${formatSigned(datum.profitCents)} profit`,
              `${formatCents(datum.saleCents)} from ${sales(datum.sales)}`,
            ]
      }
    />
  );
}

/**
 * Profit per month as columns from a zero baseline: gains in the accent color,
 * losses below the line in the danger color. `summary` is the one-line reading; a
 * hidden table carries the numbers for screen readers.
 */
export function MonthChart({ months, summary }: { months: MonthProfit[]; summary: string }) {
  const c = colors();
  return (
    <figure>
      <figcaption className="mb-4 text-sm text-muted">{summary}</figcaption>
      <div aria-hidden="true" className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={months} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={c.grid} />
            <XAxis
              dataKey="month"
              tickLine={false}
              axisLine={false}
              tick={{ fill: c.ink, fontSize: 12 }}
              tickFormatter={(month: string) => monthLabel(month)}
              interval="preserveStartEnd"
              minTickGap={8}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fill: c.ink, fontSize: 12 }}
              tickFormatter={axisDollars}
              width={56}
            />
            <ReferenceLine y={0} stroke={c.baseline} />
            <Tooltip cursor={{ fill: c.grid, opacity: 0.5 }} content={<MonthTooltip />} />
            <Bar
              dataKey="profitCents"
              radius={[4, 4, 0, 0]}
              maxBarSize={24}
              isAnimationActive={false}
            >
              {months.map((entry) => (
                <Cell key={entry.month} fill={entry.profitCents < 0 ? c.loss : c.gain} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {/* sr-only on a div: a table ignores the 1px width and would widen the page. */}
      <div className="sr-only">
        <table>
          <caption>Profit per month</caption>
          <thead>
            <tr>
              <th scope="col">Month</th>
              <th scope="col">Sales</th>
              <th scope="col">Sold for</th>
              <th scope="col">Profit</th>
            </tr>
          </thead>
          <tbody>
            {months.map((entry) => (
              <tr key={entry.month}>
                <th scope="row">{monthLabel(entry.month, true)}</th>
                <td>{entry.sales}</td>
                <td>{formatCents(entry.saleCents)}</td>
                <td>{formatSigned(entry.profitCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

function PlatformTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: PlatformProfit }>;
}) {
  const datum = payload?.[0]?.payload;
  if (!active || !datum) return null;
  return (
    <Tip
      title={datum.name}
      lines={[
        `${formatSigned(datum.profitCents)} profit, ${formatMargin(datum.margin)} margin`,
        `${formatCents(datum.saleCents)} from ${sales(datum.sales)}`,
      ]}
    />
  );
}

/**
 * Profit per platform sold on, as horizontal bars, most profitable first. One series,
 * one color (losses in the danger color), with each bar's profit written at its end.
 */
export function PlatformChart({
  platforms,
  summary,
}: {
  platforms: PlatformProfit[];
  summary: string;
}) {
  const c = colors();
  // 44px per row keeps the bars readable and each row an easy hover target.
  const height = Math.max(120, platforms.length * 44 + 24);
  return (
    <figure>
      <figcaption className="mb-4 text-sm text-muted">{summary}</figcaption>
      <div aria-hidden="true" className="w-full" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={platforms}
            layout="vertical"
            margin={{ top: 0, right: 64, bottom: 0, left: 0 }}
          >
            <CartesianGrid horizontal={false} stroke={c.grid} />
            <XAxis type="number" hide domain={[(min: number) => Math.min(0, min), "auto"]} />
            <YAxis
              type="category"
              dataKey="name"
              tickLine={false}
              axisLine={false}
              tick={{ fill: c.ink, fontSize: 12 }}
              width={112}
            />
            <ReferenceLine x={0} stroke={c.baseline} />
            <Tooltip cursor={{ fill: c.grid, opacity: 0.5 }} content={<PlatformTooltip />} />
            <Bar dataKey="profitCents" radius={[0, 4, 4, 0]} barSize={20} isAnimationActive={false}>
              {platforms.map((entry) => (
                <Cell key={entry.name} fill={entry.profitCents < 0 ? c.loss : c.gain} />
              ))}
              <LabelList
                dataKey="profitCents"
                position="right"
                formatter={(value: unknown) => formatSigned(Number(value))}
                style={{ fill: c.ink, fontSize: 12 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {/* sr-only on a div: a table ignores the 1px width and would widen the page. */}
      <div className="sr-only">
        <table>
          <caption>Profit per platform</caption>
          <thead>
            <tr>
              <th scope="col">Platform</th>
              <th scope="col">Sales</th>
              <th scope="col">Sold for</th>
              <th scope="col">Profit</th>
              <th scope="col">Margin</th>
            </tr>
          </thead>
          <tbody>
            {platforms.map((entry) => (
              <tr key={entry.name}>
                <th scope="row">{entry.name}</th>
                <td>{entry.sales}</td>
                <td>{formatCents(entry.saleCents)}</td>
                <td>{formatSigned(entry.profitCents)}</td>
                <td>{formatMargin(entry.margin)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
