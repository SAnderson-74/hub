import { describe, expect, it } from "vitest";
import { goalPace } from "./goalPace";

const today = "2030-03-31";
const formatDate = (date: string) => date;

describe("goal pace", () => {
  it("is on track, ahead, or behind the straight line to its date", () => {
    // Added Mar 1, due Apr 30: by Mar 31 about half should be done.
    const at = (percent: number) =>
      goalPace({
        today,
        start: "2030-03-01",
        percent,
        targetDate: "2030-04-30",
        checkins: [],
        formatDate,
      });
    expect(at(50).state).toBe("on_track");
    expect(at(46).state).toBe("on_track");
    expect(at(62).state).toBe("ahead");
    expect(at(30).state).toBe("behind");
    // Half done in 30 days: the rest takes about 30 more.
    expect(at(50).projectedDate).toBe("2030-04-30");
    expect(at(50).perWeek?.percent).toBe(12);
    expect(at(50).summary).toBe(
      "Needs about 12% a week to finish by 2030-04-30. At this pace, done around 2030-04-30.",
    );
  });

  it("says what an amount goal needs each week, from where it really started", () => {
    const pace = goalPace({
      today,
      start: "2030-01-01",
      percent: 60,
      targetDate: "2030-05-26",
      // $3,000 was saved when it was first checked in; it's $6,000 of $10,000 now.
      checkins: [{ date: "2030-03-03", percent: 30 }],
      amount: { currentCents: 600_000, targetCents: 1_000_000 },
      formatDate,
    });
    expect(pace.perWeek?.cents).toBe(50_000);
    expect(pace.summary).toMatch(/^Needs about \$500 a week/);
    // 30 points in 28 days; the straight line from 30% then would be at 53% now.
    expect(pace.projectedDate).toBe("2030-05-08");
    expect(pace.state).toBe("on_track");
  });

  it("waits for enough history, and knows when it's done or late", () => {
    const fresh = goalPace({
      today,
      start: "2030-03-28",
      percent: 0,
      targetDate: "2030-06-01",
      checkins: [],
      formatDate,
    });
    expect(fresh.state).toBe("unknown");
    expect(fresh.summary).toContain("Check in again in a week or so");
    const stalled = goalPace({
      today,
      start: "2030-01-01",
      percent: 0,
      targetDate: null,
      checkins: [],
      formatDate,
    });
    expect(stalled).toMatchObject({ state: "unknown", projectedDate: null, perWeek: null });
    expect(stalled.summary).toContain("No progress since it started");
    const late = goalPace({
      today,
      start: "2030-01-01",
      percent: 80,
      targetDate: "2030-03-15",
      checkins: [],
      formatDate,
    });
    expect(late.state).toBe("behind");
    expect(late.summary).toMatch(/^Its date, 2030-03-15, has passed\./);
    expect(
      goalPace({
        today,
        start: "2030-01-01",
        percent: 100,
        targetDate: null,
        checkins: [],
        formatDate,
      }).state,
    ).toBe("done");
    const milestones = goalPace({
      today,
      start: "2030-03-01",
      percent: 40,
      targetDate: "2030-04-28",
      checkins: [],
      milestonesLeft: 3,
      formatDate,
    });
    expect(milestones.summary).toMatch(/^Needs about 0\.8 milestones a week/);
  });
});
