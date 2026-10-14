import { describe, expect, it } from "vitest";
import { inSmartList, isWaiting, type Plannable, upcomingDate } from "./smartLists";

const today = "2030-01-10";
const task = (fields: Partial<Plannable> = {}): Plannable => ({
  status: "todo",
  dueDate: null,
  ...fields,
});
const lists = (item: Plannable) =>
  (["today", "upcoming", "anytime", "someday", "logbook"] as const).filter((list) =>
    inSmartList(list, item, today),
  );

describe("smart lists", () => {
  it("put each task where it belongs", () => {
    expect(lists(task())).toEqual(["anytime"]);
    expect(lists(task({ dueDate: today }))).toEqual(["today", "anytime"]);
    expect(lists(task({ dueDate: "2030-01-02" }))).toEqual(["today", "anytime"]);
    expect(lists(task({ status: "doing" }))).toEqual(["today", "anytime"]);
    expect(lists(task({ startDate: today }))).toEqual(["today", "anytime"]);
    // Due later but can be started now.
    expect(lists(task({ dueDate: "2030-01-20" }))).toEqual(["upcoming", "anytime"]);
    // Not started yet: only Upcoming, on its start date.
    const later = task({ startDate: "2030-01-15", dueDate: "2030-01-20" });
    expect(lists(later)).toEqual(["upcoming"]);
    expect(upcomingDate(later, today)).toBe("2030-01-15");
    expect(lists(task({ someday: true, dueDate: today }))).toEqual(["someday"]);
    expect(lists(task({ status: "done", dueDate: today }))).toEqual(["logbook"]);
  });

  it("keep tasks waiting on open tasks out of Today", () => {
    const waiting = task({ dueDate: today, waitingOn: [{ done: false }, { done: true }] });
    expect(isWaiting(waiting)).toBe(true);
    expect(lists(waiting)).toEqual(["anytime"]);
    const free = task({ dueDate: today, waitingOn: [{ done: true }] });
    expect(lists(free)).toEqual(["today", "anytime"]);
  });
});
