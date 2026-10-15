import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * The key pair Hub signs push requests with (VAPID), made the first time a device
 * turns on notifications. Only the public key leaves the server.
 */
export const pushKeys = sqliteTable("push_keys", {
  id: integer("id").primaryKey(),
  /** 65 bytes, base64url, as browsers want it. */
  publicKey: text("public_key").notNull(),
  /** PKCS #8 PEM. */
  privateKey: text("private_key").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * A device that turned notifications on. The endpoint is its push service's address
 * for it; the keys encrypt each message so only that device can read it.
 */
export const pushSubscriptions = sqliteTable("push_subscriptions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  name: text("name").notNull().default(""),
  /** Show what's due by name. Off means counts only, for the lock screen. */
  details: integer("details", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  lastSentAt: integer("last_sent_at", { mode: "timestamp_ms" }),
  /** The last failure's code, like "HTTP_403" or "TIMEOUT". Never the address. */
  lastError: text("last_error"),
});
