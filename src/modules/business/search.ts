import { desc, sql } from "drizzle-orm";
import { containsWords, startsWithFirst } from "../../server/db/like";
import { LEAD_STATUS_LABELS } from "../../shared/business";
import type { Searcher } from "../core/search.service";
import { businessLeads, businessNotes } from "./schema";

export const businessSearchers: Searcher[] = [
  {
    kind: "lead",
    label: "Leads",
    module: "business",
    // Open leads before won and lost ones.
    search: (db, { words, limit }) =>
      db
        .select({
          id: businessLeads.id,
          name: businessLeads.name,
          status: businessLeads.status,
          nextStep: businessLeads.nextStep,
          nextStepOn: businessLeads.nextStepOn,
        })
        .from(businessLeads)
        .where(
          containsWords(
            [
              businessLeads.name,
              businessLeads.contact,
              businessLeads.source,
              businessLeads.nextStep,
              businessLeads.notes,
            ],
            words,
          ),
        )
        .orderBy(
          sql`case when ${businessLeads.status} in ('won', 'lost') then 1 else 0 end`,
          startsWithFirst(businessLeads.name, words[0] ?? ""),
          desc(businessLeads.updatedAt),
        )
        .limit(limit)
        .all()
        .map((row) => {
          const open = row.status !== "won" && row.status !== "lost";
          return {
            id: row.id,
            title: row.name,
            detail: [LEAD_STATUS_LABELS[row.status], open ? row.nextStep : ""]
              .filter(Boolean)
              .join(" · "),
            date: open ? row.nextStepOn : null,
            amountCents: null,
            href: `/business?do=leads&lead=${row.id}`,
          };
        }),
  },
  {
    kind: "business_note",
    label: "Business notes",
    module: "business",
    search: (db, { words, limit }) =>
      db
        .select({ id: businessNotes.id, title: businessNotes.title, pinned: businessNotes.pinned })
        .from(businessNotes)
        .where(containsWords([businessNotes.title, businessNotes.body], words))
        .orderBy(
          startsWithFirst(businessNotes.title, words[0] ?? ""),
          desc(businessNotes.pinned),
          desc(businessNotes.updatedAt),
        )
        .limit(limit)
        .all()
        .map((row) => ({
          id: row.id,
          title: row.title,
          detail: row.pinned ? "Pinned" : "Note",
          date: null,
          amountCents: null,
          href: `/business?do=notes&note=${row.id}`,
        })),
  },
];
