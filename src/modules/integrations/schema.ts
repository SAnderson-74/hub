import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { REMINDER_KINDS } from "../../shared/reminders";

/**
 * Reminders already sent, so each goes out once, even across restarts. The key says
 * which: "digest:2030-03-01", "due:task:12:2030-03-02" for one item on one due date,
 * or "tithing-income:40" for income the tithing reminder has mentioned.
 */
export const reminderSends = sqliteTable("reminder_sends", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind", { enum: REMINDER_KINDS }).notNull(),
  key: text("key").notNull().unique(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  sentAt: integer("sent_at", { mode: "timestamp_ms" }).notNull(),
});
