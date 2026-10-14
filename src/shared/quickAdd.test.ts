import { describe, expect, it } from "vitest";
import { parseQuickAdd } from "./quickAdd";

// A Thursday.
const today = "2030-01-10";
const projects = [
  { id: 1, name: "Home repairs" },
  { id: 2, name: "Car" },
  { id: 3, name: "Home office", archived: true },
];
const read = (text: string, keep?: string[]) => parseQuickAdd(text, { today, projects, keep });

describe("quick add", () => {
  it("reads the example from the roadmap", () => {
    const task = read("Renew registration next Fri !high #car every year");
    expect(task).toMatchObject({
      title: "Renew registration",
      dueDate: "2030-01-11",
      priority: 3,
      tags: ["car"],
      recurrence: { frequency: "monthly", interval: 12 },
    });
    expect(task.chips.map((chip) => [chip.kind, chip.text])).toEqual([
      ["date", "next Fri"],
      ["priority", "!high"],
      ["tag", "#car"],
      ["repeat", "every year"],
    ]);
  });

  it("reads relative and calendar dates", () => {
    const due = (text: string) => read(text).dueDate;
    expect(due("Call today")).toBe(today);
    expect(due("Call tomorrow")).toBe("2030-01-11");
    expect(due("Call on monday")).toBe("2030-01-14");
    // The same weekday means a week out, not today.
    expect(due("Call thursday")).toBe("2030-01-17");
    expect(due("Call next week")).toBe("2030-01-14");
    expect(due("Call next month")).toBe("2030-02-01");
    expect(due("Call in 3 days")).toBe("2030-01-13");
    expect(due("Call in two weeks")).toBe("2030-01-24");
    expect(due("Call in a month")).toBe("2030-02-10");
    expect(due("Call Oct 20")).toBe("2030-10-20");
    // Already passed this year, so next year.
    expect(due("Call Jan 2")).toBe("2031-01-02");
    expect(due("Call by March 3rd, 2032")).toBe("2032-03-03");
    expect(due("Call 2/14")).toBe("2030-02-14");
    expect(due("Call 2/14/31")).toBe("2031-02-14");
    expect(due("Call 2031-05-06")).toBe("2031-05-06");
    expect(due("Call Feb 30")).toBeNull();
    expect(read("Call on Oct 20").title).toBe("Call");
  });

  it("leaves ordinary words alone", () => {
    for (const text of [
      "Buy sun screen",
      "Sat in traffic notes",
      "Ask the friar",
      "Today's notes",
    ]) {
      const task = read(text);
      expect(task.dueDate, text).toBe(text.startsWith("Today") ? today : null);
    }
    expect(read("Email john.smith@example.com about the #1 thing").chips).toEqual([
      { kind: "tag", text: "#1", label: "#1" },
    ]);
    // Only the first date counts; the rest stays in the title.
    expect(read("Move tomorrow's meeting to friday")).toMatchObject({
      dueDate: "2030-01-11",
      title: "Move 's meeting to friday",
    });
  });

  it("reads repeats, with a first date when none is given", () => {
    expect(read("Water plants every 3 days")).toMatchObject({
      recurrence: { frequency: "daily", interval: 3 },
      dueDate: today,
      title: "Water plants",
    });
    expect(read("Standup every weekday").recurrence).toEqual({
      frequency: "weekly",
      interval: 1,
      weekdays: [1, 2, 3, 4, 5],
    });
    expect(read("Trash every tuesday")).toMatchObject({
      recurrence: { frequency: "weekly", interval: 1, weekdays: [2] },
      dueDate: "2030-01-15",
    });
    expect(read("Pay rent monthly on 2/1")).toMatchObject({
      recurrence: { frequency: "monthly", interval: 1 },
      dueDate: "2030-02-01",
    });
    expect(read("Mow every other week").recurrence).toEqual({ frequency: "weekly", interval: 2 });
  });

  it("reads priority, tags, and projects", () => {
    expect(read("Fix sink !m #home #plumbing #home @home")).toMatchObject({
      title: "Fix sink",
      priority: 2,
      tags: ["home", "plumbing"],
      // An active project beats an archived one with the same start.
      projectId: 1,
    });
    expect(read("Oil change @car !1").projectId).toBe(2);
    expect(read("Mow the lawn ~45m")).toMatchObject({ title: "Mow the lawn", estimateMinutes: 45 });
    expect(read("Clean the garage ~1.5h").estimateMinutes).toBe(90);
    expect(read("Clean the garage ~2 hours").chips[0]?.label).toBe("2 h");
    expect(read("Oil change @boat").projectId).toBeNull();
    expect(read("Oil change @boat").title).toBe("Oil change @boat");
  });

  it("keeps words as text when a chip is turned back", () => {
    const task = read("Plan the next week party friday #fun", ["next week", "#fun"]);
    expect(task).toMatchObject({
      title: "Plan the next week party #fun",
      dueDate: "2030-01-11",
      tags: [],
    });
  });
});
