import { describe, expect, it } from "vitest";
import { type CashFlowJson, flowColumns } from "../../shared/cashFlow";
import { fitLabel, layoutFlow, NODE_WIDTH } from "./cashFlowLayout";

const item = (name: string, cents: number) => ({ key: name, name, cents });
const flow = (incoming: CashFlowJson["incoming"], outgoing: CashFlowJson["outgoing"]) =>
  flowColumns({ from: "2030-03-01", to: "2030-03-31", incoming, outgoing });

describe("layoutFlow", () => {
  it("sizes nodes and bands by amount, meeting in the middle", () => {
    const columns = flow(
      [item("Paycheck", 300_000)],
      [item("Rent", 200_000), item("Food", 50_000)],
    );
    const layout = layoutFlow(columns, 360, 240);
    const [paycheck] = layout.sources;
    const [rent, food, left] = layout.sinks;
    expect(paycheck?.height).toBe(240);
    expect(rent?.height).toBe(160);
    expect(food?.height).toBe(40);
    expect(left?.name).toBe("Left over");
    expect(paycheck?.x).toBe(0);
    expect(rent?.x).toBe(360 - NODE_WIDTH);
    expect(layout.middle.height).toBe(240);
    expect(layout.bands.map((band) => band.key)).toEqual(["Paycheck", "Rent", "Food", "left"]);
  });

  it("gives tiny amounts room for their labels", () => {
    const columns = flow(
      [item("Paycheck", 1_000_000)],
      [item("A", 10), item("B", 10), item("C", 10)],
    );
    const layout = layoutFlow(columns, 360, 240);
    const [a, b, c] = layout.sinks;
    expect(a?.height).toBe(2);
    // Label centers stay at least a label's height apart.
    expect((b?.labelY ?? 0) - (a?.labelY ?? 0)).toBeGreaterThanOrEqual(36);
    expect((c?.labelY ?? 0) - (b?.labelY ?? 0)).toBeGreaterThanOrEqual(36);
    expect(layout.height).toBeGreaterThan(240);
  });

  it("draws nothing for an empty period", () => {
    const layout = layoutFlow(flow([], []), 360, 240);
    expect(layout.bands).toEqual([]);
    expect(layout.sources).toEqual([]);
  });
});

describe("fitLabel", () => {
  it("shortens long names", () => {
    expect(fitLabel("Groceries", 100)).toBe("Groceries");
    expect(fitLabel("Home improvement and repairs", 74)).toBe("Home impr…");
  });
});
