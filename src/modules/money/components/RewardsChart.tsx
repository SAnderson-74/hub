import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCents } from "../../../shared/money";
import { monthLabel } from "../../../shared/profit";
import type { RewardsReport } from "../queries";

/** Chart colors come from the theme's CSS variables. */
function themeColor(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

// The validated chart series (styles.css), in order. Cards take slots by their place
// among the book's cards with rewards, not by what they earned, so a card keeps its
// color from month to month.
const SERIES = [
  ["--color-chart-1", "#1e66f5", "bg-chart-1"],
  ["--color-chart-2", "#eb5a02", "bg-chart-2"],
  ["--color-chart-3", "#03939a", "bg-chart-3"],
  ["--color-chart-4", "#c77c06", "bg-chart-4"],
  ["--color-chart-5", "#d05eb3", "bg-chart-5"],
  ["--color-chart-6", "#40a02b", "bg-chart-6"],
  ["--color-chart-7", "#8839ef", "bg-chart-7"],
  ["--color-chart-8", "#d20f39", "bg-chart-8"],
] as const;

const BAR = 22;

/** Whole dollars for the axis: "$12". */
const axisDollars = (cents: number) => formatCents(Math.round(cents / 100) * 100);

type Series = { key: string; name: string; color: string; swatch: string };
type Row = { month: string } & Record<string, number | string>;

function MonthTooltip({
  active,
  payload,
  series,
}: {
  active?: boolean;
  payload?: Array<{ payload: Row }>;
  series: Series[];
}) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="rounded-tile bg-base px-3 py-2 text-sm ring-1 ring-surface-1">
      <p className="font-semibold text-fg">{monthLabel(row.month, true)}</p>
      {series.map((entry) => (
        <p key={entry.key} className="text-muted tabular-nums">
          {entry.name}: {formatCents(Number(row[entry.key] ?? 0))}
        </p>
      ))}
    </div>
  );
}

/** "In 2030, your cards earned about $123.45. The most came from Store card, $80.12." */
export function rewardsSummary(report: RewardsReport): string {
  const earning = report.cards.filter((entry) => entry.program !== null);
  const total = earning.reduce((sum, entry) => sum + entry.valueCents, 0);
  if (total === 0) return `Your cards haven't earned anything in ${report.year} yet.`;
  const top = [...earning].sort((a, b) => b.valueCents - a.valueCents)[0];
  return `In ${report.year}, your cards earned about ${formatCents(total)}.${
    top && earning.length > 1
      ? ` The most came from ${top.card.name}, ${formatCents(top.valueCents)}.`
      : ""
  }`;
}

/**
 * What the cards earned each month, as value (cash back, and points at their worth),
 * one stacked segment per card. The tooltip and table say it in numbers.
 */
export function RewardsChart({ report }: { report: RewardsReport }) {
  const earning = report.cards.filter((entry) => entry.program !== null);
  const series: Series[] = earning.slice(0, SERIES.length).map((entry, index) => {
    const [variable, fallback, swatch] = SERIES[index] ?? SERIES[0];
    return {
      key: `card-${entry.card.id}`,
      name: entry.card.name,
      color: themeColor(variable, fallback),
      swatch,
    };
  });
  const rows: Row[] = (earning[0]?.months ?? []).map((month, index) => ({
    month: month.month,
    ...Object.fromEntries(
      earning
        .slice(0, SERIES.length)
        .map((entry) => [
          `card-${entry.card.id}`,
          Math.max(0, entry.months[index]?.valueCents ?? 0),
        ]),
    ),
  }));
  const ink = themeColor("--color-muted", "#a0afc8");
  const grid = themeColor("--color-surface-0", "#2a3444");
  const surface = themeColor("--color-mantle", "#131a25");

  return (
    <figure>
      <figcaption className="mb-3 text-sm text-muted">{rewardsSummary(report)}</figcaption>
      {series.length > 1 ? (
        <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted" aria-label="Legend">
          {series.map((entry) => (
            <li key={entry.key} className="flex items-center gap-2">
              <span aria-hidden="true" className={`size-3 rounded-sm ${entry.swatch}`} />
              {entry.name}
            </li>
          ))}
        </ul>
      ) : null}
      <div aria-hidden="true" className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barSize={BAR}>
            <CartesianGrid vertical={false} stroke={grid} />
            <XAxis
              dataKey="month"
              tickLine={false}
              axisLine={false}
              tick={{ fill: ink, fontSize: 12 }}
              tickFormatter={(month: string) => monthLabel(month)}
              interval="preserveStartEnd"
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fill: ink, fontSize: 12 }}
              tickFormatter={axisDollars}
              width={52}
            />
            <Tooltip
              cursor={{ fill: grid, opacity: 0.5 }}
              content={<MonthTooltip series={series} />}
            />
            {series.map((entry, index) => (
              // A 2px surface ring keeps the stacked cards apart.
              <Bar
                key={entry.key}
                dataKey={entry.key}
                stackId="earned"
                fill={entry.color}
                stroke={surface}
                strokeWidth={2}
                radius={index === series.length - 1 ? [4, 4, 0, 0] : 0}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-3 text-sm">
        <summary className="min-h-11 cursor-pointer py-2 font-semibold text-fg">
          Show the numbers
        </summary>
        <div className="overflow-x-auto">
          <table className="w-full text-left tabular-nums">
            <caption className="sr-only">Rewards earned per month</caption>
            <thead className="text-muted">
              <tr>
                <th scope="col" className="py-1 pr-3 font-semibold">
                  Month
                </th>
                {series.map((entry) => (
                  <th key={entry.key} scope="col" className="py-1 pl-3 text-right font-semibold">
                    {entry.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="text-fg">
              {rows.map((row) => (
                <tr key={row.month} className="border-t border-surface-0">
                  <th scope="row" className="py-1 pr-3 font-normal">
                    {monthLabel(row.month, true)}
                  </th>
                  {series.map((entry) => (
                    <td key={entry.key} className="py-1 pl-3 text-right">
                      {formatCents(Number(row[entry.key] ?? 0))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
