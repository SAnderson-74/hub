import { describe, expect, it } from "vitest";
import { type CashFlowJson, flowColumns, flowSummary, periodLabel } from "./cashFlow";

const item = (name: string, cents: number) => ({ key: name, name, cents });
const flow = (incoming: CashFlowJson["incoming"], outgoing: CashFlowJson["outgoing"]) => ({
  from: "2030-03-01",
  to: "2030-03-31",
  incoming,
  outgoing,
});

describe("flowColumns", () => {
  it("sends what's left over to its own node", () => {
    const columns = flowColumns(flow([item("Paycheck", 300_000)], [item("Rent", 150_000)]));
    expect(columns.sinks.map((node) => [node.name, node.cents, node.role])).toEqual([
      ["Rent", 150_000, "out"],
      ["Left over", 150_000, "left"],
    ]);
    expect(columns).toMatchObject({ totalCents: 300_000, inCents: 300_000, outCents: 150_000 });
  });

  it("covers spending past income from account balances", () => {
    const columns = flowColumns(flow([item("Paycheck", 100_000)], [item("Rent", 150_000)]));
    expect(columns.sources.map((node) => [node.name, node.cents, node.role])).toEqual([
      ["Paycheck", 100_000, "in"],
      ["From account balances", 50_000, "drawn"],
    ]);
    expect(columns.sinks.map((node) => node.name)).toEqual(["Rent"]);
    expect(columns.totalCents).toBe(150_000);
  });

  it("folds small categories together so labels stay readable", () => {
    const out = ["A", "B", "C", "D", "E"].map((name, index) => item(name, 5_000 - index * 1_000));
    const columns = flowColumns(flow([item("Paycheck", 15_000)], out), 5, 3);
    expect(columns.sinks.map((node) => [node.name, node.cents])).toEqual([
      ["A", 5_000],
      ["B", 4_000],
      ["Other spending", 6_000],
    ]);
  });
});

describe("flowSummary", () => {
  it("says what came in, went out, and where the most went", () => {
    const columns = flowColumns(flow([item("Paycheck", 300_000)], [item("Rent", 150_000)]));
    expect(flowSummary(columns, "March 2030")).toBe(
      "In March 2030, $3,000 came in and $1,500 went out, leaving $1,500. The most went to Rent, $1,500.",
    );
    const short = flowColumns(flow([item("Paycheck", 100_000)], [item("Rent", 150_000)]));
    expect(flowSummary(short, "March 2030")).toContain("$500 more than came in");
    expect(flowSummary(flowColumns(flow([], [])), "March 2030")).toBe(
      "No money came in or went out in March 2030.",
    );
  });

  it("names the period", () => {
    expect(periodLabel("2030-03", 1)).toBe("March 2030");
    expect(periodLabel("2030-03", 12)).toBe("the 12 months to March 2030");
  });
});
