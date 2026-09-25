import { z } from "zod";

/**
 * Everything that can be tagged, linked, or show up in the activity log. A new module
 * adds its type here and a label lookup in src/modules/core/entities.ts.
 */
export const ENTITY_TYPES = ["project", "task"] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export type EntityRef = { type: EntityType; id: number };

/** Lowercase names for messages like "That task doesn't exist." */
export const ENTITY_TYPE_NAMES: Record<EntityType, string> = {
  project: "project",
  task: "task",
};

const entityId = z.number().int().positive();

export const entityRefSchema = z.object({ type: z.enum(ENTITY_TYPES), id: entityId }).strict();

/** `?type=task&id=12` */
export const entityQuerySchema = z.object({
  type: z.enum(ENTITY_TYPES),
  id: z.coerce.number().int().positive(),
});

// Tags

export const tagNameSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/\s+/g, " "))
  .pipe(
    z
      .string()
      .min(1, "Tags can't be empty.")
      .max(40, "Keep tags under 40 characters.")
      .refine((value) => !value.includes(","), "Tags can't contain commas."),
  );

export const tagNamesSchema = z.array(tagNameSchema).max(20, "Use at most 20 tags.");

export const tagUpdateSchema = z.object({ name: tagNameSchema }).strict();
export type TagUpdate = z.infer<typeof tagUpdateSchema>;

// Links

export const linkRelationSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z][a-z0-9_]{0,39}$/, "Use a short relation name like related or blocks.");

export const linkCreateSchema = z
  .object({
    from: entityRefSchema,
    to: entityRefSchema,
    relation: linkRelationSchema.default("related"),
  })
  .strict();
export type LinkCreate = z.infer<typeof linkCreateSchema>;

// Activity

export const ACTIVITY_ACTIONS = ["created", "updated", "deleted", "linked", "unlinked"] as const;
export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

export type ActivityValue = string | number | boolean | null | string[];

/** "updated" records each changed field; "linked" and "unlinked" record the other end. */
export type ActivityDetails =
  | { changes: Record<string, { from: ActivityValue; to: ActivityValue }> }
  | {
      relation: string;
      direction: "outgoing" | "incoming";
      other: { type: EntityType; id: number; label: string };
    };

export const activityQuerySchema = z
  .object({
    type: z.enum(ENTITY_TYPES).optional(),
    id: z.coerce.number().int().positive().optional(),
    /** Entries older than this entry id, for paging. */
    before: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .refine((query) => query.id === undefined || query.type !== undefined, {
    message: "Pass type along with id.",
    path: ["type"],
  });
export type ActivityQuery = z.infer<typeof activityQuerySchema>;
