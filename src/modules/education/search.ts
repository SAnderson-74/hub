import { desc, eq } from "drizzle-orm";
import { containsWords, startsWithFirst } from "../../server/db/like";
import { COURSE_STATUS_LABELS } from "../../shared/education";
import type { Searcher } from "../core/search.service";
import { courses, terms } from "./schema";

export const courseSearchers: Searcher[] = [
  {
    kind: "course",
    label: "Courses",
    module: "courses",
    // Newer terms first, since that's where current courses are.
    search: (db, { words, limit }) =>
      db
        .select({
          id: courses.id,
          code: courses.code,
          title: courses.title,
          status: courses.status,
          termId: courses.termId,
          term: terms.name,
        })
        .from(courses)
        .innerJoin(terms, eq(terms.id, courses.termId))
        .where(containsWords([courses.code, courses.title, courses.notes], words))
        .orderBy(
          startsWithFirst(courses.code, words[0] ?? ""),
          startsWithFirst(courses.title, words[0] ?? ""),
          desc(terms.startDate),
          courses.sortOrder,
        )
        .limit(limit)
        .all()
        .map((row) => ({
          id: row.id,
          title: row.code ? `${row.code} ${row.title}` : row.title,
          detail: `${row.term} · ${COURSE_STATUS_LABELS[row.status]}`,
          date: null,
          amountCents: null,
          href: `/courses?term=${row.termId}&course=${row.id}`,
        })),
  },
];
