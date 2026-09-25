import { describe, expect, it } from "vitest";
import { describeDue, localDate } from "./dates";
import { groupByStatus, orderAfterStep, orderAt, orderForDrop } from "./ordering";

const list = [
  { id: 1, sortOrder: 1 },
  { id: 2, sortOrder: 2 },
  { id: 3, sortOrder: 3 },
];

describe("ordering", () => {
  it("places items between, before, and after neighbors", () => {
    expect(orderAt(list, 0, 9)).toBe(0);
    expect(orderAt(list, 1, 9)).toBe(1.5);
    expect(orderAt(list, 3, 9)).toBe(4);
    expect(orderAt([], 0, 9)).toBe(9);
  });

  it("steps an item up or down, stopping at the ends", () => {
    expect(orderAfterStep(list, 3, -1)).toBe(1.5); // between 1 and 2
    expect(orderAfterStep(list, 1, 1)).toBe(2.5); // between 2 and 3
    expect(orderAfterStep(list, 1, -1)).toBeNull();
    expect(orderAfterStep(list, 3, 1)).toBeNull();
    expect(orderAfterStep(list, 99, 1)).toBeNull();
  });

  it("orders drops and ignores drops back into the same place", () => {
    const moving = { id: 1, sortOrder: 1 };
    expect(orderForDrop(list, moving, 0)).toBeNull();
    expect(orderForDrop(list, moving, 2)).toBe(4); // after 2 and 3
    expect(orderForDrop(list, moving, 1)).toBe(2.5);
    // From another column: every index is a move.
    expect(orderForDrop(list, { id: 7, sortOrder: 50 }, 0)).toBe(0);
  });

  it("groups tasks by status in board order", () => {
    const groups = groupByStatus([
      { id: 1, status: "done" as const },
      { id: 2, status: "todo" as const },
      { id: 3, status: "todo" as const },
    ]);
    expect(Object.keys(groups)).toEqual(["backlog", "todo", "doing", "done"]);
    expect(groups.todo.map((task) => task.id)).toEqual([2, 3]);
  });
});

describe("due dates", () => {
  const today = "2030-03-13"; // a Wednesday

  it("describes due dates relative to today", () => {
    expect(describeDue("2030-03-10", today)).toEqual({ label: "Overdue, Mar 10", tone: "danger" });
    expect(describeDue("2030-03-13", today)).toEqual({ label: "Due today", tone: "warn" });
    expect(describeDue("2030-03-14", today).label).toBe("Due tomorrow");
    expect(describeDue("2030-03-17", today).label).toBe("Due Sunday");
    expect(describeDue("2030-04-02", today).label).toBe("Due Apr 2");
    expect(describeDue("2031-01-05", today).label).toBe("Due Jan 5, 2031");
  });

  it("counts days across daylight saving changes", () => {
    expect(describeDue("2030-03-11", "2030-03-09").label).toBe("Due Monday");
  });

  it("formats local dates", () => {
    expect(localDate(new Date(2030, 0, 5, 23, 30))).toBe("2030-01-05");
  });
});
