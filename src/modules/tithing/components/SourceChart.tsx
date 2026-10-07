import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCents } from "../../../shared/money";
import { type SourceRow, sourceSummary } from "../../../shared/tithing";

function themeColor(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

const axisDollars = (cents: number) => formatCents(Math.round(cents / 100) * 100);

type Row = SourceRow & { exemptCents: number };

function SourceTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: Row }>;
}) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="rounded-tile bg-base px-3 py-2 text-sm ring-1 ring-surface-1">
      <p className="font-semibold text-fg">{row.source}</p>
      <p className="text-muted tabular-nums">{formatCents(row.incomeCents)} income</p>
      <p className="text-muted tabular-nums">{formatCents(row.tithableCents)} tithed on</p>
      <p className="text-muted tabular-nums">{formatCents(row.exemptCents)} not tithed on</p>
    </div>
  );
}

/**
 * Income by where it came from: the part tithing is figured on, and the part it isn't
 * (a sale's costs, or income switched off).
 */
export function SourceChart({ year, sources }: { year: number; sources: SourceRow[] }) {
  const tithed = themeColor("--accent-text", "#22d3ee");
  const exempt = themeColor("--color-surface-2", "#525d70");
  const ink = themeColor("--color-muted", "#a0afc8");
  const grid = themeColor("--color-surface-0", "#2a3444");
  const rows: Row[] = sources.map((row) => ({
    ...row,
    exemptCents: Math.max(0, row.incomeCents - row.tithableCents),
  }));
  return (
    <figure>
      <figcaption className="mb-3 text-sm text-muted">{sourceSummary(year, sources)}</figcaption>
      <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted" aria-label="Legend">
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="size-3 rounded-sm bg-accent-text" />
          Tithed on
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden="true" className="size-3 rounded-sm bg-surface-2" />
          Not tithed on
        </li>
      </ul>
      <div aria-hidden="true" style={{ height: 56 + rows.length * 44 }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            layout="vertical"
            margin={{ top: 0, right: 8, bottom: 0, left: 0 }}
            barSize={22}
          >
            <CartesianGrid horizontal={false} stroke={grid} />
            <XAxis
              type="number"
              tickLine={false}
              axisLine={false}
              tick={{ fill: ink, fontSize: 12 }}
              tickFormatter={axisDollars}
            />
            <YAxis
              type="category"
              dataKey="source"
              tickLine={false}
              axisLine={false}
              tick={{ fill: ink, fontSize: 12 }}
              width={96}
            />
            <Tooltip cursor={{ fill: grid, opacity: 0.5 }} content={<SourceTooltip />} />
            <Bar dataKey="tithableCents" stackId="income" fill={tithed} isAnimationActive={false} />
            <Bar
              dataKey="exemptCents"
              stackId="income"
              fill={exempt}
              radius={[0, 4, 4, 0]}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="sr-only">
        <table>
          <caption>Income by source in {year}</caption>
          <thead>
            <tr>
              <th scope="col">Source</th>
              <th scope="col">Income</th>
              <th scope="col">Tithed on</th>
              <th scope="col">Not tithed on</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.source}>
                <th scope="row">{row.source}</th>
                <td>{formatCents(row.incomeCents)}</td>
                <td>{formatCents(row.tithableCents)}</td>
                <td>{formatCents(row.exemptCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
