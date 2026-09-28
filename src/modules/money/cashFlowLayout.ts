import type { FlowColumns, FlowNode, FlowRole } from "../../shared/cashFlow";

// Positions for the cash flow chart: money in on the left, the total in the middle,
// money out on the right. Heights follow the amounts; each node gets at least enough
// room for its two-line label, so small amounts never overlap.

export const NODE_WIDTH = 10;
/** Room for a label: name and amount. */
const SLOT = 36;
const GAP = 8;
/** Above the plot, for the total's label. */
const HEADER = 40;

export type PlacedNode = FlowNode & {
  x: number;
  y: number;
  height: number;
  /** Where its label is centered. */
  labelY: number;
};

export type Band = {
  key: string;
  role: FlowRole;
  path: string;
  /** Midpoint of the band, for a tooltip. */
  midX: number;
  midY: number;
};

export type FlowLayout = {
  height: number;
  sources: PlacedNode[];
  sinks: PlacedNode[];
  middle: { x: number; y: number; height: number };
  bands: Band[];
};

/** A ribbon of thickness `t` from (x0, a) to (x1, b), curving in between. */
function ribbon(x0: number, a: number, x1: number, b: number, t: number): string {
  const xm = (x0 + x1) / 2;
  const r = (n: number) => Math.round(n * 10) / 10;
  return [
    `M${r(x0)},${r(a)}`,
    `C${r(xm)},${r(a)} ${r(xm)},${r(b)} ${r(x1)},${r(b)}`,
    `L${r(x1)},${r(b + t)}`,
    `C${r(xm)},${r(b + t)} ${r(xm)},${r(a + t)} ${r(x0)},${r(a + t)}`,
    "Z",
  ].join(" ");
}

function stack(nodes: FlowNode[], x: number, scale: number) {
  let cursor = 0;
  const placed = nodes.map((node) => {
    const thickness = node.cents * scale;
    const height = Math.max(2, thickness);
    const slot = Math.max(height, SLOT);
    const y = cursor + (slot - height) / 2;
    cursor += slot + GAP;
    return { ...node, x, y, height, labelY: y + height / 2, thickness };
  });
  return { placed, size: Math.max(0, cursor - GAP) };
}

/** Lays the chart out for a width. The total's column is `column` pixels tall. */
export function layoutFlow(columns: FlowColumns, width: number, column: number): FlowLayout {
  const scale = columns.totalCents > 0 ? column / columns.totalCents : 0;
  const left = stack(columns.sources, 0, scale);
  const right = stack(columns.sinks, width - NODE_WIDTH, scale);
  const plot = Math.max(left.size, right.size, column);
  const height = HEADER + plot;
  const shift = (size: number) => HEADER + (plot - size) / 2;
  const middle = {
    x: (width - NODE_WIDTH) / 2,
    y: HEADER + (plot - column) / 2,
    height: column,
  };

  const bands: Band[] = [];
  const place = (side: typeof left, offset: number, toMiddle: boolean): PlacedNode[] => {
    let along = middle.y;
    return side.placed.map(({ thickness, ...node }) => {
      const y = node.y + offset;
      const at = y + (node.height - thickness) / 2;
      const [x0, a, x1, b] = toMiddle
        ? [NODE_WIDTH, at, middle.x, along]
        : [middle.x + NODE_WIDTH, along, width - NODE_WIDTH, at];
      if (thickness > 0) {
        bands.push({
          key: node.key,
          role: node.role,
          path: ribbon(x0, a, x1, b, thickness),
          midX: (x0 + x1) / 2,
          midY: (a + b + thickness) / 2,
        });
      }
      along += thickness;
      return { ...node, y, labelY: node.labelY + offset };
    });
  };
  const sources = place(left, shift(left.size), true);
  const sinks = place(right, shift(right.size), false);
  return { height, sources, sinks, middle, bands };
}

/** Shortens a label to about `maxWidth` pixels at the chart's type size. */
export function fitLabel(text: string, maxWidth: number, charWidth = 7.4): string {
  const max = Math.max(4, Math.floor(maxWidth / charWidth));
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}
