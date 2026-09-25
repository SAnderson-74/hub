import { sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { ACTIVITY_ACTIONS, type ActivityDetails, ENTITY_TYPES } from "../../shared/entities";

const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date());

/** Key/value user settings. Keys and value shapes are defined in src/shared/settings.ts. */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

/** Tag names are unique regardless of letter case. */
export const tags = sqliteTable(
  "tags",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("tags_name_unique").on(sql`lower(${t.name})`)],
);

/** Which tags are on which entity (see ENTITY_TYPES). */
export const taggings = sqliteTable(
  "taggings",
  {
    tagId: integer("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    entityType: text("entity_type", { enum: ENTITY_TYPES }).notNull(),
    entityId: integer("entity_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.tagId, t.entityType, t.entityId] }),
    index("taggings_entity_idx").on(t.entityType, t.entityId),
  ],
);

/** A named, directed connection between any two entities, like a task and a resale item. */
export const links = sqliteTable(
  "links",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    fromType: text("from_type", { enum: ENTITY_TYPES }).notNull(),
    fromId: integer("from_id").notNull(),
    toType: text("to_type", { enum: ENTITY_TYPES }).notNull(),
    toId: integer("to_id").notNull(),
    relation: text("relation").notNull().default("related"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("links_unique").on(t.fromType, t.fromId, t.toType, t.toId, t.relation),
    index("links_to_idx").on(t.toType, t.toId),
  ],
);

/**
 * Who changed what and when. Entries outlive the entity, so `label` keeps its name
 * as it was at the time.
 */
export const activityLog = sqliteTable(
  "activity_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    entityType: text("entity_type", { enum: ENTITY_TYPES }).notNull(),
    entityId: integer("entity_id").notNull(),
    action: text("action", { enum: ACTIVITY_ACTIONS }).notNull(),
    label: text("label").notNull(),
    details: text("details", { mode: "json" }).$type<ActivityDetails>(),
    actor: text("actor").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("activity_log_entity_idx").on(t.entityType, t.entityId)],
);
