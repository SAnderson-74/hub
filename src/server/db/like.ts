import { type SQL, sql } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";

// SQLite's LIKE ignores case for ASCII letters, which suits names and notes.

/** Escapes LIKE wildcards so a search for "50%" finds "50%", not everything. */
export const likePattern = (text: string) => `%${escapeLike(text)}%`;

const escapeLike = (text: string) => text.replace(/[\\%_]/g, (char) => `\\${char}`);

type Searchable = SQLiteColumn | SQL;

/** Every word appears in at least one of the columns. */
export function containsWords(columns: Searchable[], words: string[]): SQL {
  return sql.join(
    words.map((word) => {
      const pattern = likePattern(word);
      const any = sql.join(
        columns.map((column) => sql`${column} like ${pattern} escape '\\'`),
        sql` or `,
      );
      return sql`(${any})`;
    }),
    sql` and `,
  );
}

/** 0 when the column starts with the text and 1 otherwise, to sort those first. */
export function startsWithFirst(column: Searchable, text: string): SQL {
  return sql`case when ${column} like ${`${escapeLike(text)}%`} escape '\\' then 0 else 1 end`;
}
