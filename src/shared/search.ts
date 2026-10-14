import { z } from "zod";
import { parseSignedDollars } from "./money";

// One search box for every module. The server asks each turned-on module for matches
// and answers with them grouped; the command menu adds its own actions and pages.

/** Results per group unless the request asks for more. */
export const SEARCH_LIMIT = 5;
/** The fewest characters the command menu searches for. */
export const SEARCH_MIN_LENGTH = 2;
const MAX_WORDS = 8;

export const searchQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .min(1, "Type something to search for.")
    .max(100, "Keep searches under 100 characters."),
  limit: z.coerce.number().int().min(1).max(20).default(SEARCH_LIMIT),
});
export type SearchQuery = z.infer<typeof searchQuerySchema>;

export type SearchResult = {
  id: number;
  title: string;
  /** Plain context, like "Home repairs · Done". */
  detail: string;
  /** A calendar date the menu shows as "Oct 14", when the result has one. */
  date: string | null;
  /** An amount the menu shows as "−$42.18", when the result has one. */
  amountCents: number | null;
  /** Where it opens in the app, like "/tasks?task=12". */
  href: string;
};

export type SearchGroup = {
  kind: string;
  label: string;
  results: SearchResult[];
  /** Whether more matched than were sent. */
  more: boolean;
};

export type SearchResponse = { groups: SearchGroup[] };

/** The words to look for. Each must appear somewhere in a result. */
export function searchWords(q: string): string[] {
  return [...new Set(q.trim().toLowerCase().split(/\s+/).filter(Boolean))].slice(0, MAX_WORDS);
}

/**
 * The amount a search could mean, in positive cents: "42.18", "$42.18", "-42.18", and
 * "1,250" all count. Null when it isn't an amount.
 */
export function searchAmountCents(q: string): number | null {
  const cents = parseSignedDollars(q);
  return cents === null || cents === 0 ? null : Math.abs(cents);
}
