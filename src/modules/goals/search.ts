import { desc, sql } from "drizzle-orm";
import { containsWords, startsWithFirst } from "../../server/db/like";
import { GOAL_STATUS_LABELS } from "../../shared/goals";
import type { Searcher } from "../core/search.service";
import { goals, milestones } from "./schema";

/** A goal's milestones as one string, so a search for a step finds its goal. */
const milestoneTitles = sql`(select group_concat(${milestones.title}, ' ') from ${milestones} where ${milestones.goalId} = ${goals.id})`;

export const goalSearchers: Searcher[] = [
  {
    kind: "goal",
    label: "Goals",
    module: "goals",
    search: (db, { words, limit }) =>
      db
        .select({
          id: goals.id,
          title: goals.title,
          status: goals.status,
          targetDate: goals.targetDate,
        })
        .from(goals)
        .where(containsWords([goals.title, goals.notes, milestoneTitles], words))
        .orderBy(
          sql`case when ${goals.status} = 'active' then 0 else 1 end`,
          startsWithFirst(goals.title, words[0] ?? ""),
          desc(goals.updatedAt),
        )
        .limit(limit)
        .all()
        .map((row) => ({
          id: row.id,
          title: row.title,
          detail: GOAL_STATUS_LABELS[row.status],
          date: row.status === "active" ? row.targetDate : null,
          amountCents: null,
          href: `/goals?goal=${row.id}`,
        })),
  },
];
