import type { Context } from "hono";
import { z } from "zod";

/** `/:id` route parameters. */
export const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

type ValidationResult =
  | { success: true }
  | {
      success: false;
      error: { issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }> };
    };

/**
 * A zValidator hook that answers invalid input with the app's error shape:
 * `{ error, issues: [{ path, message }] }` and status 400.
 *
 *   zValidator("json", taskCreateSchema, invalid("That task isn't valid."))
 */
export function invalid(message: string) {
  return (result: ValidationResult, c: Context) => {
    if (!result.success) {
      const issues = result.error.issues.map((issue) => ({
        path: issue.path.map(String).join("."),
        message: issue.message,
      }));
      return c.json({ error: message, issues }, 400);
    }
  };
}
