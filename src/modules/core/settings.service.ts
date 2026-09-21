import type { Db } from "../../server/db/client";
import {
  defaultSettings,
  type Settings,
  type SettingsPatch,
  settingsSchema,
} from "../../shared/settings";
import { settings } from "./schema";

/** Stored settings merged over defaults. Invalid stored values fall back to their default. */
export function readSettings(db: Db): Settings {
  const stored = new Map(
    db
      .select()
      .from(settings)
      .all()
      .map((row) => [row.key, row.value]),
  );
  const result: Record<string, unknown> = { ...defaultSettings };
  for (const [key, schema] of Object.entries(settingsSchema.shape)) {
    if (!stored.has(key)) continue;
    const parsed = schema.safeParse(stored.get(key));
    if (parsed.success) result[key] = parsed.data;
  }
  return settingsSchema.parse(result);
}

export function writeSettings(db: Db, patch: SettingsPatch): Settings {
  const now = new Date();
  db.transaction((tx) => {
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue;
      tx.insert(settings)
        .values({ key, value, updatedAt: now })
        .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: now } })
        .run();
    }
  });
  return readSettings(db);
}
