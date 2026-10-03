import { z } from "zod";
import { modulesSchema, timeZoneSchema } from "./modules";

/** First-run setup: which modules to use, the time zone, and whether to add examples. */
export const setupSchema = z
  .object({
    modules: modulesSchema,
    timeZone: timeZoneSchema,
    /** Adds example data, only on an empty install. */
    demo: z.boolean(),
  })
  .strict();
export type SetupInput = z.infer<typeof setupSchema>;
