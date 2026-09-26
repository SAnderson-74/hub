import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMinutes } from "../../../shared/time";

const SHORT_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const LONG_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** Chart colors come from the theme's CSS variables, so they follow the accent setting. */
function themeColor(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

type Datum = { day: string; name: string; hours: number; minutes: number };

function DayTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: Datum }>;
}) {
  const datum = payload?.[0]?.payload;
  if (!active || !datum) return null;
  return (
    <div className="rounded-tile bg-base px-3 py-2 text-sm ring-1 ring-surface-1">
      <p className="font-semibold text-fg">{datum.name}</p>
      <p className="text-muted tabular-nums">{formatMinutes(datum.minutes)}</p>
    </div>
  );
}

/**
 * Minutes per day as bars, Monday first. `summary` is the one-line reading of the
 * chart; a hidden table carries the same numbers for screen readers.
 */
export function WeekChart({ days, summary }: { days: number[]; summary: string }) {
  const data: Datum[] = days.map((minutes, index) => ({
    day: SHORT_DAYS[index] ?? "",
    name: LONG_DAYS[index] ?? "",
    hours: minutes / 60,
    minutes,
  }));
  const bar = themeColor("--accent-text", "#22d3ee");
  const ink = themeColor("--color-muted", "#a0afc8");
  const grid = themeColor("--color-surface-0", "#2a3444");

  return (
    <figure>
      <figcaption className="mb-4 text-sm text-muted">{summary}</figcaption>
      <div aria-hidden="true" className="h-52 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 4, right: 4, bottom: 0, left: -12 }}
            barCategoryGap="28%"
          >
            <CartesianGrid vertical={false} stroke={grid} strokeDasharray="3 4" />
            <XAxis
              dataKey="day"
              tickLine={false}
              axisLine={false}
              tick={{ fill: ink, fontSize: 12 }}
              interval={0}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fill: ink, fontSize: 12 }}
              tickFormatter={(value: number) => `${value} h`}
              allowDecimals={false}
              width={48}
            />
            <Tooltip cursor={{ fill: grid, opacity: 0.5 }} content={<DayTooltip />} />
            <Bar
              dataKey="hours"
              fill={bar}
              radius={[4, 4, 0, 0]}
              maxBarSize={36}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Time logged per day</caption>
        <tbody>
          {data.map((datum) => (
            <tr key={datum.day}>
              <th scope="row">{datum.name}</th>
              <td>{formatMinutes(datum.minutes)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
