import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ProjectionPoint } from "../../../shared/health";
import { formatCents } from "../../../shared/money";
import { formatSigned } from "../../../shared/profit";

/** Chart colors come from the theme's CSS variables, so they follow the accent setting. */
function themeColor(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/** Whole dollars, shortened for the axis: "$41k", "$1.2M". */
function axisDollars(cents: number): string {
  const dollars = cents / 100;
  const size = Math.abs(dollars);
  if (size >= 1_000_000) return `${dollars < 0 ? "-" : ""}$${(size / 1_000_000).toFixed(1)}M`;
  if (size >= 1_000) return `${dollars < 0 ? "-" : ""}$${Math.round(size / 1_000)}k`;
  return formatSigned(Math.round(cents / 100) * 100);
}

function YearTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ProjectionPoint }>;
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="rounded-tile bg-base px-3 py-2 text-sm ring-1 ring-surface-1">
      <p className="font-semibold text-fg">{point.year === 0 ? "Now" : `In ${point.year} years`}</p>
      <p className="text-muted tabular-nums">{formatSigned(point.netCents)} with growth</p>
      <p className="text-muted tabular-nums">{formatSigned(point.savedOnlyCents)} saving alone</p>
    </div>
  );
}

/** Projected net worth by year, with growth and with saving alone. */
export function ProjectionChart({
  points,
  summary,
}: {
  points: ProjectionPoint[];
  summary: string;
}) {
  const c = {
    growth: themeColor("--accent-text", "#22d3ee"),
    saving: themeColor("--color-surface-2", "#525d70"),
    ink: themeColor("--color-muted", "#a0afc8"),
    grid: themeColor("--color-surface-0", "#2a3444"),
  };
  return (
    <figure>
      <figcaption className="mb-3 text-sm text-muted">{summary}</figcaption>
      <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted" aria-label="Legend">
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="h-0.5 w-4 rounded-full bg-accent-text" />
          With growth
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="h-0.5 w-4 rounded-full bg-surface-2" />
          Saving alone
        </li>
      </ul>
      <div aria-hidden="true" className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            accessibilityLayer={false}
            data={points}
            margin={{ top: 4, right: 8, bottom: 0, left: 0 }}
          >
            <CartesianGrid vertical={false} stroke={c.grid} />
            <XAxis
              dataKey="year"
              tickLine={false}
              axisLine={false}
              tick={{ fill: c.ink, fontSize: 12 }}
              tickFormatter={(year: number) => (year === 0 ? "Now" : `${year}y`)}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fill: c.ink, fontSize: 12 }}
              tickFormatter={axisDollars}
              width={56}
            />
            <Tooltip content={<YearTooltip />} />
            <Line
              type="monotone"
              dataKey="savedOnlyCents"
              stroke={c.saving}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="netCents"
              stroke={c.growth}
              strokeWidth={2.5}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-3 text-sm">
        <summary className="min-h-11 cursor-pointer py-2 font-semibold text-fg">
          Show the numbers
        </summary>
        <table className="w-full text-left tabular-nums">
          <caption className="sr-only">Projected net worth by year</caption>
          <thead className="text-muted">
            <tr>
              <th scope="col" className="py-1 font-semibold">
                Year
              </th>
              <th scope="col" className="py-1 text-right font-semibold">
                With growth
              </th>
              <th scope="col" className="py-1 text-right font-semibold">
                Saving alone
              </th>
            </tr>
          </thead>
          <tbody className="text-fg">
            {points.map((point) => (
              <tr key={point.year} className="border-t border-surface-0">
                <th scope="row" className="py-1 font-normal">
                  {point.year === 0 ? "Now" : point.year}
                </th>
                <td className="py-1 text-right">{formatCents(point.netCents)}</td>
                <td className="py-1 text-right">{formatCents(point.savedOnlyCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
