import { type PointerEvent, useEffect, useRef, useState } from "react";
import type { CashFlowJson, FlowColumns, FlowNode, FlowRole } from "../../../shared/cashFlow";
import { formatCents } from "../../../shared/money";
import { type Band, fitLabel, layoutFlow, NODE_WIDTH, type PlacedNode } from "../cashFlowLayout";

// Money in uses the accent; money out a neutral gray, so the two sides read apart even
// before their labels. What came from account balances is a darker gray.
const NODE_CLASS: Record<FlowRole, string> = {
  in: "fill-accent-text",
  left: "fill-accent-text",
  out: "fill-faint",
  drawn: "fill-surface-2",
};
const BAND_CLASS: Record<FlowRole, string> = {
  in: "fill-accent-text",
  left: "fill-accent-text",
  out: "fill-faint",
  drawn: "fill-surface-2",
};

/** The width of an element, kept up to date as it resizes. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    setWidth(element.clientWidth);
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

const share = (cents: number, of: number) =>
  of > 0 ? `${Math.max(1, Math.round((cents / of) * 100))}%` : "0%";

function describe(node: FlowNode, columns: FlowColumns): string {
  if (node.role === "drawn") return "More went out than came in";
  if (node.role === "left") return `${share(node.cents, columns.inCents)} of money in`;
  return node.role === "in"
    ? `${share(node.cents, columns.inCents)} of money in`
    : `${share(node.cents, columns.outCents)} of money out`;
}

/** A node's two-line label, on the inside of its column, with a halo over the bands. */
function NodeLabel({
  node,
  side,
  width,
}: {
  node: PlacedNode;
  side: "left" | "right";
  width: number;
}) {
  const x = side === "left" ? NODE_WIDTH + 6 : width - NODE_WIDTH - 6;
  const room = width / 2 - NODE_WIDTH - 18;
  return (
    <text
      x={x}
      y={node.labelY}
      textAnchor={side === "left" ? "start" : "end"}
      className="stroke-mantle text-[13px]"
      strokeWidth={4}
      strokeLinejoin="round"
      paintOrder="stroke"
    >
      <tspan x={x} dy="-0.2em" className="fill-fg font-semibold">
        {fitLabel(node.name, room)}
      </tspan>
      <tspan x={x} dy="1.25em" className="fill-muted text-xs tabular-nums">
        {formatCents(node.cents)}
      </tspan>
    </text>
  );
}

/**
 * Where money came from and where it went: money in on the left, the total in the
 * middle, money out on the right, each band as wide as its amount. Hovering or tapping
 * a band or node says its amount and share; the table has every number.
 */
export function CashFlowChart({
  flow,
  columns,
  summary,
}: {
  flow: CashFlowJson;
  columns: FlowColumns;
  summary: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<string | null>(null);
  const column = width < 520 ? 220 : 280;
  const layout = width > 0 ? layoutFlow(columns, width, column) : null;
  const nodes = layout ? [...layout.sources, ...layout.sinks] : [];
  const shown = nodes.find((node) => node.key === active) ?? null;
  const shownBand = layout?.bands.find((band) => band.key === active) ?? null;
  // A mouse shows a band's details while over it; a tap keeps them until the next tap.
  const hover = (key: string) => ({
    onPointerEnter: () => setActive(key),
    onPointerDown: () => setActive(key),
    onPointerLeave: (event: PointerEvent<SVGElement>) => {
      if (event.pointerType === "mouse") {
        setActive((current) => (current === key ? null : current));
      }
    },
  });
  const empty = columns.totalCents === 0;

  return (
    <figure>
      <figcaption className="mb-3 text-sm text-muted">{summary}</figcaption>
      {empty ? null : (
        <>
          <ul
            className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted"
            aria-label="Legend"
          >
            <li className="flex items-center gap-2">
              <span aria-hidden="true" className="size-3 rounded-sm bg-accent-text" />
              Money in
            </li>
            <li className="flex items-center gap-2">
              <span aria-hidden="true" className="size-3 rounded-sm bg-faint" />
              Money out
            </li>
          </ul>
          <div ref={ref} aria-hidden="true" className="relative w-full">
            {layout ? (
              <svg
                aria-hidden="true"
                width={width}
                height={layout.height}
                viewBox={`0 0 ${width} ${layout.height}`}
                className="block overflow-visible"
                onPointerDown={(event) => {
                  if (event.target === event.currentTarget) setActive(null);
                }}
              >
                <text
                  x={width / 2}
                  y={14}
                  textAnchor="middle"
                  className="fill-fg text-[13px] font-semibold"
                >
                  Total
                </text>
                <text
                  x={width / 2}
                  y={30}
                  textAnchor="middle"
                  className="fill-muted text-xs tabular-nums"
                >
                  {formatCents(columns.totalCents)}
                </text>
                {layout.bands.map((band: Band) => (
                  <path
                    key={band.key}
                    d={band.path}
                    className={`${BAND_CLASS[band.role]} cursor-pointer transition-opacity`}
                    fillOpacity={active === null ? 0.3 : active === band.key ? 0.6 : 0.15}
                    {...hover(band.key)}
                  />
                ))}
                <rect
                  x={layout.middle.x}
                  y={layout.middle.y}
                  width={NODE_WIDTH}
                  height={layout.middle.height}
                  rx={4}
                  className="fill-fg"
                />
                {nodes.map((node) => (
                  <rect
                    key={node.key}
                    x={node.x}
                    y={node.y}
                    width={NODE_WIDTH}
                    height={node.height}
                    rx={Math.min(4, node.height / 2)}
                    className={`${NODE_CLASS[node.role]} cursor-pointer`}
                    {...hover(node.key)}
                  />
                ))}
                {layout.sources.map((node) => (
                  <NodeLabel key={node.key} node={node} side="left" width={width} />
                ))}
                {layout.sinks.map((node) => (
                  <NodeLabel key={node.key} node={node} side="right" width={width} />
                ))}
              </svg>
            ) : null}
            {shown && shownBand ? (
              <div
                className="pointer-events-none absolute z-10 w-max max-w-56 -translate-x-1/2 -translate-y-full rounded-tile bg-base px-3 py-2 text-sm ring-1 ring-surface-1"
                style={{
                  // Kept inside the chart, so it never widens the page on a phone.
                  left: Math.min(Math.max(shownBand.midX, 116), width - 116),
                  top: shownBand.midY - 8,
                }}
              >
                <p className="font-semibold text-fg">{shown.name}</p>
                <p className="text-muted tabular-nums">
                  {formatCents(shown.cents)} · {describe(shown, columns)}
                </p>
              </div>
            ) : null}
          </div>
          <details className="mt-3 text-sm">
            <summary className="min-h-11 cursor-pointer py-2 font-semibold text-fg">
              Show the numbers
            </summary>
            <table className="w-full text-left tabular-nums">
              <caption className="sr-only">Money in and out</caption>
              {(
                [
                  ["Money in", flow.incoming, columns.inCents],
                  ["Money out", flow.outgoing, columns.outCents],
                ] as const
              ).map(([title, side, total]) => (
                <tbody key={title} className="text-fg">
                  <tr className="text-muted">
                    <th scope="colgroup" className="pt-3 pb-1 font-semibold">
                      {title}
                    </th>
                    <td className="pt-3 pb-1 text-right font-semibold">{formatCents(total)}</td>
                  </tr>
                  {side.map((node) => (
                    <tr key={node.key} className="border-t border-surface-0">
                      <th scope="row" className="py-1 font-normal break-words">
                        {node.name}
                      </th>
                      <td className="py-1 text-right">{formatCents(node.cents)}</td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </details>
        </>
      )}
    </figure>
  );
}
