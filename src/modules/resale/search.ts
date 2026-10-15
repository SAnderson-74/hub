import { desc, sql } from "drizzle-orm";
import { containsWords, startsWithFirst } from "../../server/db/like";
import { ITEM_STATUS_LABELS } from "../../shared/resale";
import type { Searcher } from "../core/search.service";
import { resaleItems } from "./schema";

export const resaleSearchers: Searcher[] = [
  {
    kind: "resale_item",
    label: "Resale items",
    module: "resale",
    // By title, SKU (typed from a label), or where it's kept. Items still in hand come
    // before sold and kept ones.
    search: (db, { words, limit }) =>
      db
        .select({
          id: resaleItems.id,
          title: resaleItems.title,
          status: resaleItems.status,
          category: resaleItems.category,
          sku: resaleItems.sku,
        })
        .from(resaleItems)
        .where(
          containsWords(
            [
              resaleItems.title,
              resaleItems.sku,
              resaleItems.spot,
              resaleItems.category,
              resaleItems.condition,
              resaleItems.purchaseFrom,
              resaleItems.notes,
              resaleItems.buyerNotes,
            ],
            words,
          ),
        )
        .orderBy(
          sql`case when ${resaleItems.status} in ('sold', 'kept') then 1 else 0 end`,
          startsWithFirst(resaleItems.title, words[0] ?? ""),
          desc(resaleItems.updatedAt),
        )
        .limit(limit)
        .all()
        .map((row) => ({
          id: row.id,
          title: row.title,
          detail: [ITEM_STATUS_LABELS[row.status], row.category, row.sku]
            .filter(Boolean)
            .join(" · "),
          date: null,
          amountCents: null,
          href: `/resale?item=${row.id}`,
        })),
  },
];
