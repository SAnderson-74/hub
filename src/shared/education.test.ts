import { describe, expect, it } from "vitest";
import { termPacing } from "./education";

const today = "2030-03-20";
const course = (
  credits: number,
  status: "not_started" | "in_progress" | "passed" | "transferred",
  plannedEnd: string | null,
) => ({
  credits,
  status,
  plannedEnd,
});

describe("term pacing", () => {
  it("compares credits earned with credits planned to be done by now", () => {
    const courses = [
      course(3, "passed", "2030-02-15"),
      course(3, "in_progress", "2030-03-15"),
      course(4, "not_started", "2030-05-01"),
    ];
    expect(termPacing({ creditGoal: 10 }, courses, today)).toEqual({
      earned: 3,
      goal: 10,
      planned: 6,
      state: "behind",
      summary: "Behind by 3 credits: 3 of 10 credits, 6 planned by now.",
    });
    const onPace = [course(3, "passed", "2030-02-15"), course(3, "transferred", "2030-03-15")];
    expect(termPacing({ creditGoal: 12 }, onPace, today).summary).toBe(
      "On pace: 6 of 12 credits, as planned.",
    );
    const ahead = [course(1, "passed", "2030-02-15"), course(3, "passed", "2030-04-15")];
    expect(termPacing({ creditGoal: 12 }, ahead, today).summary).toBe(
      "Ahead by 3 credits: 4 of 12 credits, 1 planned by now.",
    );
  });

  it("handles early terms, reached goals, and a missing goal", () => {
    expect(
      termPacing({ creditGoal: 6 }, [course(3, "in_progress", "2030-04-01")], today),
    ).toMatchObject({
      state: "early",
      summary: "0 of 6 credits so far. Nothing was planned to finish yet.",
    });
    const done = [course(3, "passed", "2030-02-01"), course(3, "passed", null)];
    expect(termPacing({ creditGoal: 6 }, done, today).summary).toBe(
      "Credit goal reached: 6 of 6 credits.",
    );
    // Without a goal, the term's courses add up to it.
    expect(
      termPacing(
        { creditGoal: null },
        [course(1.5, "passed", null), course(3, "in_progress", null)],
        today,
      ),
    ).toMatchObject({
      earned: 1.5,
      goal: 4.5,
    });
  });
});
