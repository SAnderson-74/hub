import { z } from "zod";

/** Where an item is, from finding it to selling (or keeping) it. */
export const ITEM_STATUSES = [
  "sourcing",
  "acquired",
  "repairing",
  "listed",
  "sold",
  "kept",
] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

export const ITEM_STATUS_LABELS: Record<ItemStatus, string> = {
  sourcing: "Sourcing",
  acquired: "Acquired",
  repairing: "Repairing",
  listed: "Listed",
  sold: "Sold",
  kept: "Kept",
};

/** Bought and not yet sold or kept: the money tied up in stock. */
export const IN_STOCK_STATUSES: readonly ItemStatus[] = ["acquired", "repairing", "listed"];

const date = z.iso.date("Use a date like 2030-01-31.");
const cents = z
  .number()
  .int("Use whole cents.")
  .min(0, "Amounts can't be negative.")
  .max(100_000_000, "Use an amount under $1,000,000.");
const shortText = (max: number, what: string) =>
  z.string().trim().max(max, `Keep ${what} under ${max} characters.`);
const notes = z.string().max(20_000, "Keep notes under 20,000 characters.");

const platformName = z
  .string()
  .trim()
  .min(1, "Give the platform a name.")
  .max(80, "Keep platform names under 80 characters.");

export const platformCreateSchema = z
  .object({ name: platformName, notes: notes.optional() })
  .strict();
export type PlatformCreate = z.infer<typeof platformCreateSchema>;

export const platformUpdateSchema = z
  .object({ name: platformName, notes, archived: z.boolean() })
  .partial()
  .strict();
export type PlatformUpdate = z.infer<typeof platformUpdateSchema>;

const itemFields = {
  title: z
    .string()
    .trim()
    .min(1, "Give the item a title.")
    .max(200, "Keep titles under 200 characters."),
  status: z.enum(ITEM_STATUSES),
  category: shortText(80, "categories"),
  condition: shortText(80, "conditions"),
  purchasedOn: date.nullable(),
  purchaseCents: cents.nullable(),
  /** Where it was bought, from the platforms list. */
  purchasePlatformId: z.number().int().positive().nullable(),
  /** The seller or place, like "Garage sale" or a store name. */
  purchaseFrom: shortText(200, "seller names"),
  notes,
};

export const itemCreateSchema = z.object(itemFields).partial().required({ title: true }).strict();
export type ItemCreate = z.infer<typeof itemCreateSchema>;

export const itemUpdateSchema = z.object(itemFields).partial().strict();
export type ItemUpdate = z.infer<typeof itemUpdateSchema>;

/** `?status=listed` or several, like `?status=acquired,repairing`. */
export const itemListQuerySchema = z
  .object({
    status: z
      .string()
      .transform((value) => value.split(",").map((part) => part.trim()))
      .pipe(z.array(z.enum(ITEM_STATUSES))),
  })
  .partial();
