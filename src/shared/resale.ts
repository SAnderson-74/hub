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

/** What a cost was for. */
export const COST_KINDS = ["parts", "fees", "shipping", "supplies", "other"] as const;
export type CostKind = (typeof COST_KINDS)[number];

export const COST_KIND_LABELS: Record<CostKind, string> = {
  parts: "Parts",
  fees: "Fees",
  shipping: "Shipping",
  supplies: "Supplies",
  other: "Other",
};

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
  /** Sale details. Marking an item sold dates it today unless soldOn is given. */
  soldOn: date.nullable(),
  saleCents: cents.nullable(),
  salePlatformId: z.number().int().positive().nullable(),
  buyerNotes: z.string().max(2_000, "Keep buyer notes under 2,000 characters."),
  /** false marks an imported item as reviewed. */
  needsReview: z.boolean(),
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

const costFields = {
  kind: z.enum(COST_KINDS),
  /** What exactly, like "Replacement battery". Optional. */
  label: shortText(120, "cost labels"),
  amountCents: cents,
  spentOn: date.nullable(),
};

export const costCreateSchema = z
  .object(costFields)
  .partial()
  .required({ kind: true, amountCents: true })
  .strict();
export type CostCreate = z.infer<typeof costCreateSchema>;

export const costUpdateSchema = z.object(costFields).partial().strict();
export type CostUpdate = z.infer<typeof costUpdateSchema>;

/** A web address for a listing, or "" for none. */
const listingUrl = z
  .string()
  .trim()
  .max(2_000, "Keep links under 2,000 characters.")
  .refine((value) => value === "" || /^https?:\/\/\S+$/i.test(value), {
    message: "Use a web address that starts with https://.",
  });

export const listingCreateSchema = z
  .object({
    platformId: z.number().int().positive().nullable().optional(),
    priceCents: cents,
    /** Defaults to today. */
    listedOn: date.optional(),
    url: listingUrl.optional(),
    title: z.string().trim().max(200, "Keep listing titles under 200 characters.").optional(),
    description: z.string().max(20_000, "Keep listing text under 20,000 characters.").optional(),
  })
  .strict();
export type ListingCreate = z.infer<typeof listingCreateSchema>;

export const listingUpdateSchema = z
  .object({
    platformId: z.number().int().positive().nullable(),
    listedOn: date,
    /** When the listing came down; null reopens it. */
    endedOn: date.nullable(),
    url: listingUrl,
  })
  .partial()
  .strict();
export type ListingUpdate = z.infer<typeof listingUpdateSchema>;

/** A new asking price for a listing. Earlier prices stay as its history. */
export const priceChangeSchema = z
  .object({ priceCents: cents, changedOn: date.optional() })
  .strict();
export type PriceChange = z.infer<typeof priceChangeSchema>;
