import { describe, expect, it } from "vitest";
import { goalDraftChanges, goalDraftErrors, toGoalDraft } from "./draft";
import type { GoalDetail } from "./queries";

const goal: GoalDetail = {
  id: 1,
  title: "Emergency fund",
  notes: "",
  targetDate: "2030-12-31",
  status: "active",
  closedAt: null,
  progressMode: "amount",
  manualPercent: 0,
  targetCents: 500_000,
  currentCents: 125_050,
  sortOrder: 1,
  createdAt: "2030-01-01T00:00:00.000Z",
  updatedAt: "2030-01-01T00:00:00.000Z",
  progress: { percent: 25, summary: "$1,250.50 of $5,000" },
  milestones: [],
  linkedTaskCount: 0,
  tasks: [],
};

describe("goal form", () => {
  it("round-trips a saved goal without changes", () => {
    const draft = toGoalDraft(goal);
    expect(draft).toMatchObject({ target: "5000", current: "1250.50", targetDate: "2030-12-31" });
    expect(goalDraftChanges(goal, draft)).toEqual({});
    // Typing the same amount differently isn't a change.
    expect(goalDraftChanges(goal, { ...draft, target: "$5,000.00", current: "1,250.5" })).toEqual(
      {},
    );
  });

  it("sends only what changed, in API form", () => {
    const draft = {
      ...toGoalDraft(goal),
      title: " Rainy day fund ",
      current: "2000",
      target: "",
      targetDate: "",
    };
    expect(goalDraftChanges(goal, draft)).toEqual({
      title: "Rainy day fund",
      currentCents: 200_000,
      targetCents: null,
      targetDate: null,
    });
  });

  it("explains what blocks saving", () => {
    const draft = { ...toGoalDraft(goal), title: "", target: "lots", current: "-5" };
    expect(goalDraftErrors(draft)).toEqual({
      title: "Give the goal a title.",
      target: "Use an amount like 5000 or 5,000.00.",
      current: "Use an amount like 1250 or 1,250.00.",
    });
    expect(goalDraftErrors(toGoalDraft(goal))).toEqual({});
  });
});
