import type { Queryable } from "../../server/db/client";
import type { ModuleId } from "../../shared/modules";
import {
  type SearchQuery,
  type SearchResponse,
  type SearchResult,
  searchAmountCents,
  searchWords,
} from "../../shared/search";
import { businessSearchers } from "../business/search";
import { courseSearchers } from "../education/search";
import { goalSearchers } from "../goals/search";
import { moneySearchers } from "../money/search";
import { resaleSearchers } from "../resale/search";
import { taskSearchers } from "../tasks/search";
import { readSettings } from "./settings.service";

export type SearchInput = {
  /** Lowercase words; each must appear in a match. */
  words: string[];
  /** What the search means as an amount, in positive cents, if it can be one. */
  amountCents: number | null;
  /** How many to return. Searchers return up to this many, best first. */
  limit: number;
};

/** One kind of result. A module lists its searchers in its own search.ts. */
export type Searcher = {
  kind: string;
  /** The group's heading, like "Tasks". */
  label: string;
  module: ModuleId;
  search: (db: Queryable, input: SearchInput) => SearchResult[];
};

/** Every kind of result, in the order the groups show. A new module adds its searchers. */
const searchers: Searcher[] = [
  ...taskSearchers,
  ...goalSearchers,
  ...courseSearchers,
  ...resaleSearchers,
  ...moneySearchers,
  ...businessSearchers,
];

/** Matches from each turned-on module, grouped by kind. Groups with no matches are left out. */
export function search(db: Queryable, query: SearchQuery): SearchResponse {
  const words = searchWords(query.q);
  const amountCents = searchAmountCents(query.q);
  const { modules } = readSettings(db);
  const groups = searchers
    .filter((searcher) => modules[searcher.module])
    .map((searcher) => {
      // One extra says whether there are more.
      const found = searcher.search(db, { words, amountCents, limit: query.limit + 1 });
      return {
        kind: searcher.kind,
        label: searcher.label,
        results: found.slice(0, query.limit),
        more: found.length > query.limit,
      };
    })
    .filter((group) => group.results.length > 0);
  return { groups };
}
