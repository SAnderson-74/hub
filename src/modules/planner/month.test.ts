import { describe, expect, it } from "vitest";
import { monthGrid, monthLabel, shiftMonth } from "./month";

describe("month grid", () => {
  it("runs Monday to Sunday around the month", () => {
    // March 2030 starts on a Friday and ends on a Sunday.
    const grid = monthGrid("2030-03");
    expect(grid.from).toBe("2030-02-25");
    expect(grid.to).toBe("2030-03-31");
    expect(grid.weeks).toHaveLength(5);
    expect(grid.weeks[0]).toEqual([
      "2030-02-25",
      "2030-02-26",
      "2030-02-27",
      "2030-02-28",
      "2030-03-01",
      "2030-03-02",
      "2030-03-03",
    ]);
    // A month starting on Monday starts the grid on the 1st.
    expect(monthGrid("2030-04").from).toBe("2030-04-01");
    expect(monthGrid("2030-04").to).toBe("2030-05-05");
  });

  it("moves between months and years", () => {
    expect(shiftMonth("2030-12", 1)).toBe("2031-01");
    expect(shiftMonth("2030-01", -1)).toBe("2029-12");
    expect(shiftMonth("2030-03", 0)).toBe("2030-03");
    expect(monthLabel("2030-03")).toBe("March 2030");
  });
});
