import { z } from "zod";

// Notifications on a phone's Home Screen app or a browser (Web Push). Each device turns
// them on for itself. Messages are encrypted for that device alone, and by default the
// lock screen shows counts, not what's due.

export const pushSubscribeSchema = z
  .object({
    endpoint: z.string().url("That isn't a push address.").max(1_000),
    keys: z
      .object({
        p256dh: z.string().min(1).max(200),
        auth: z.string().min(1).max(50),
      })
      .strict(),
    name: z.string().trim().max(40, "Keep device names under 40 characters.").default(""),
  })
  .strict();
export type PushSubscribe = z.input<typeof pushSubscribeSchema>;

export const pushUpdateSchema = z
  .object({
    name: z.string().trim().max(40, "Keep device names under 40 characters."),
    /** Show what's due by name instead of counts. */
    details: z.boolean(),
  })
  .partial()
  .strict();
export type PushUpdate = z.infer<typeof pushUpdateSchema>;

/** What a device is shown: the full message, or the counts-only one for the lock screen. */
export type PushMessage = {
  title: string;
  body: string;
  /** Without names or amounts. */
  brief: { title: string; body: string };
  /** A notification with the same tag replaces the last one. */
  tag: string;
  /** Where tapping it opens: a path in Hub. */
  url: string;
};

/** How many devices can have notifications on. */
export const MAX_DEVICES = 20;
