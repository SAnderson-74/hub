import { describe, expect, it } from "vitest";
import { buildTimeline } from "./timeline";

const today = "2030-03-13";

describe("goal timeline", () => {
  it("orders dated goals and milestones by month with a today marker", () => {
    const months = buildTimeline(
      [
        {
          id: 1,
          title: "Run a 10K",
          targetDate: "2030-04-20",
          status: "active",
          milestones: [
            { id: 11, title: "Run 3K", targetDate: "2030-03-01", done: true },
            { id: 12, title: "Run 5K", targetDate: "2030-03-10", done: false },
            { id: 13, title: "Run 8K", targetDate: "2030-03-13", done: false },
            { id: 14, title: "Stretch daily", targetDate: null, done: false },
          ],
        },
        {
          id: 2,
          title: "Dropped plan",
          targetDate: "2030-03-20",
          status: "dropped",
          milestones: [],
        },
        {
          id: 3,
          title: "Save for a bike",
          targetDate: "2030-04-20",
          status: "achieved",
          milestones: [],
        },
        { id: 4, title: "Someday", targetDate: null, status: "active", milestones: [] },
      ],
      today,
    );

    expect(months.map((month) => month.label)).toEqual(["March 2030", "April 2030"]);
    const march = months[0]?.items.map((item) =>
      item.kind === "today" ? "today" : `${item.title}:${item.state}`,
    );
    expect(march).toEqual(["Run 3K:done", "Run 5K:overdue", "today", "Run 8K:today"]);
    const april = months[1]?.items.map((item) =>
      item.kind === "today" ? "today" : `${item.title}:${item.state}`,
    );
    expect(april).toEqual(["Run a 10K:upcoming", "Save for a bike:done"]);
  });

  it("still shows where today is when nothing is dated", () => {
    expect(buildTimeline([], today)).toEqual([
      {
        key: "2030-03",
        label: "March 2030",
        items: [{ kind: "today", key: "today", date: today }],
      },
    ]);
  });
});
