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
import { formatSigned } from "../../../shared/profit";

function themeColor(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export type ForecastPoint = { date: string; label: string; balanceCents: number };

/** One account's expected balance by day, with the low-balance line. */
export function ForecastChart({
  points,
  lowCents,
  summary,
}: {
  points: ForecastPoint[];
  lowCents: number;
  summary: string;
}) {
  const line = themeColor("--accent-text", "#22d3ee");
  const ink = themeColor("--color-muted", "#a0afc8");
  const grid = themeColor("--color-surface-0", "#2a3444");
  const warn = themeColor("--color-warn", "#f5c25b");
  return (
    <figure>
      <figcaption className="mb-3 text-sm text-muted">{summary}</figcaption>
      <div aria-hidden="true" className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            accessibilityLayer={false}
            data={points}
            margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
          >
            <CartesianGrid vertical={false} stroke={grid} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fill: ink, fontSize: 12 }}
              minTickGap={24}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fill: ink, fontSize: 12 }}
              tickFormatter={(value: number) => formatSigned(Math.round(value) * 100)}
              width={72}
              domain={["auto", "auto"]}
            />
            <ReferenceLine y={lowCents / 100} stroke={warn} strokeDasharray="4 4" />
            <Tooltip
              formatter={(value) => formatSigned(Math.round(Number(value) * 100))}
              labelStyle={{ color: "#000" }}
            />
            <Line
              dataKey={(point: ForecastPoint) => point.balanceCents / 100}
              type="stepAfter"
              stroke={line}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
