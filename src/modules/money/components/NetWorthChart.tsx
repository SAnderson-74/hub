import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCents } from "../../../shared/money";
import type { NetWorthPoint } from "../../../shared/netWorth";
import { formatSigned, monthLabel } from "../../../shared/profit";

/** Chart colors come from the theme's CSS variables, so they follow the accent setting. */
function themeColor(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function colors() {
  return {
    line: themeColor("--accent-text", "#22d3ee"),
    ink: themeColor("--color-muted", "#a0afc8"),
    grid: themeColor("--color-surface-0", "#2a3444"),
    zero: themeColor("--color-surface-2", "#525d70"),
    surface: themeColor("--color-mantle", "#131a25"),
  };
}

// The chart plots dollars, not cents, so the axis steps land on round dollar amounts.
const dollars = (point: NetWorthPoint) => point.netCents / 100;

/** Whole dollars for the axis: "-$1,200". */
const axisDollars = (value: number) => formatSigned(Math.round(value) * 100);

/** "Sep 2026", or "Today" for the last point. */
function pointLabel(point: NetWorthPoint, last: boolean): string {
  return last ? "Today" : monthLabel(point.month, true);
}

function PointTooltip({
  active,
  payload,
  lastMonth,
}: {
  active?: boolean;
  payload?: Array<{ payload: NetWorthPoint }>;
  lastMonth: string;
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="rounded-tile bg-base px-3 py-2 text-sm ring-1 ring-surface-1">
      <p className="font-semibold text-fg">{pointLabel(point, point.month === lastMonth)}</p>
      <p className="text-fg tabular-nums">Net worth {formatSigned(point.netCents)}</p>
      <p className="text-muted tabular-nums">Assets {formatCents(point.assetsCents)}</p>
      <p className="text-muted tabular-nums">Debts {formatCents(point.debtsCents)}</p>
    </div>
  );
}

/**
 * Net worth at the end of each month, as one line on one dollar axis, ending at
 * today's value with a dot. A zero line shows when it crosses from owing to owning.
 * The tooltip and table give assets and debts too.
 */
export function NetWorthChart({ points, summary }: { points: NetWorthPoint[]; summary: string }) {
  const c = colors();
  const lastMonth = points.at(-1)?.month ?? "";
  const values = points.map((point) => point.netCents);
  const crossesZero = Math.min(...values) < 0 && Math.max(...values) > 0;
  const long = points.length > 12;
  return (
    <figure>
      <figcaption className="mb-3 text-sm text-muted">{summary}</figcaption>
      <div aria-hidden="true" className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={c.grid} />
            <XAxis
              dataKey="month"
              tickLine={false}
              axisLine={false}
              tick={{ fill: c.ink, fontSize: 12 }}
              tickFormatter={(month: string) => monthLabel(month, long)}
              minTickGap={16}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fill: c.ink, fontSize: 12 }}
              tickFormatter={axisDollars}
              width={72}
              domain={["auto", "auto"]}
            />
            {crossesZero ? <ReferenceLine y={0} stroke={c.zero} /> : null}
            <Tooltip
              cursor={{ stroke: c.zero, strokeWidth: 1 }}
              content={<PointTooltip lastMonth={lastMonth} />}
            />
            <Line
              dataKey={dollars}
              type="linear"
              stroke={c.line}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              isAnimationActive={false}
              dot={(props: { cx?: number; cy?: number; index?: number }) =>
                props.index === points.length - 1 && props.cx !== undefined ? (
                  <circle
                    key="end"
                    cx={props.cx}
                    cy={props.cy}
                    r={4}
                    fill={c.line}
                    stroke={c.surface}
                    strokeWidth={2}
                  />
                ) : (
                  <g key={`dot-${props.index}`} />
                )
              }
              activeDot={{ r: 5, fill: c.line, stroke: c.surface, strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-3 text-sm">
        <summary className="min-h-11 cursor-pointer py-2 font-semibold text-fg">
          Show the numbers
        </summary>
        <div className="overflow-x-auto">
          <table className="w-full text-left tabular-nums">
            <caption className="sr-only">Net worth at the end of each month</caption>
            <thead className="text-muted">
              <tr>
                <th scope="col" className="py-1 font-semibold">
                  Month
                </th>
                <th scope="col" className="py-1 text-right font-semibold">
                  Assets
                </th>
                <th scope="col" className="py-1 text-right font-semibold">
                  Debts
                </th>
                <th scope="col" className="py-1 text-right font-semibold">
                  Net worth
                </th>
              </tr>
            </thead>
            <tbody className="text-fg">
              {points.map((point) => (
                <tr key={point.month} className="border-t border-surface-0">
                  <th scope="row" className="py-1 font-normal">
                    {pointLabel(point, point.month === lastMonth)}
                  </th>
                  <td className="py-1 text-right">{formatCents(point.assetsCents)}</td>
                  <td className="py-1 text-right">{formatCents(point.debtsCents)}</td>
                  <td className="py-1 text-right font-semibold">{formatSigned(point.netCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
