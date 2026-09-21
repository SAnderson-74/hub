import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** Key/value user settings. Keys and value shapes are defined in src/shared/settings.ts. */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});
