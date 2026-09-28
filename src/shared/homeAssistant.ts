import { z } from "zod";

// Sending Hub's summary and reminders to Home Assistant webhooks. The addresses are
// entered in Settings and live in the database; a webhook ID works like a password.

/** A webhook address, or "" when that part is off. */
const webhookUrl = z
  .string()
  .trim()
  .max(500, "Keep the address under 500 characters.")
  .refine(
    (value) => value === "" || (/^https?:\/\//i.test(value) && URL.canParse(value)),
    "Use the full webhook address, starting with http:// or https://.",
  );

export const SUMMARY_INTERVALS = [15, 30, 60] as const;
export type SummaryInterval = (typeof SUMMARY_INTERVALS)[number];

export const homeAssistantSchema = z
  .object({
    /** Where the summary goes, like http://192.0.2.10:8123/api/webhook/<id>. */
    summaryUrl: webhookUrl,
    /** Where reminders go. */
    reminderUrl: webhookUrl,
    /** How often the summary is sent, in minutes. */
    summaryMinutes: z.union(
      SUMMARY_INTERVALS.map((minutes) => z.literal(minutes)),
      "Send the summary every 15, 30, or 60 minutes.",
    ),
  })
  .strict();
export type HomeAssistantSettings = z.infer<typeof homeAssistantSchema>;

export const defaultHomeAssistant: HomeAssistantSettings = {
  summaryUrl: "",
  reminderUrl: "",
  summaryMinutes: 15,
};

/** What a reminder carries. Home Assistant decides how to show it. */
export type Reminder = { title: string; message: string };
