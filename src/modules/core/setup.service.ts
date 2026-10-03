import { count } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import type { Config } from "../../server/config";
import { localDateParts } from "../../server/db/backup";
import type { Db, Queryable } from "../../server/db/client";
import { conflict } from "../../server/errors";
import { applyTimeZone } from "../../server/timeZone";
import type { Settings } from "../../shared/settings";
import type { SetupInput } from "../../shared/setup";
import {
  businessGear,
  businessLeads,
  businessNotes,
  businessPhases,
  businessSkills,
} from "../business/schema";
import { terms } from "../education/schema";
import { goals } from "../goals/schema";
import { moneyBooks } from "../money/schema";
import { resaleItems } from "../resale/schema";
import { projects, tasks } from "../tasks/schema";
import { timeEntries } from "../time/schema";
import { hasDemoData, seedDemo } from "./demo.service";
import { readSettings, writeSettings } from "./settings.service";

/** Tables where anything at all means Hub is already in use. */
const CONTENT: SQLiteTable[] = [
  tasks,
  projects,
  goals,
  terms,
  timeEntries,
  resaleItems,
  moneyBooks,
  businessPhases,
  businessLeads,
  businessNotes,
  businessGear,
  businessSkills,
];

/** Whether nothing has been added yet. */
export function isEmpty(db: Queryable): boolean {
  return CONTENT.every((table) => (db.select({ n: count() }).from(table).get()?.n ?? 0) === 0);
}

export type SetupStatus = {
  /** Shown on a new, empty install until it's done. */
  needed: boolean;
  /** HUB_TIMEZONE, the default when no time zone is chosen. */
  serverTimeZone: string;
  /** Whether example data is in place, for removing it. */
  demo: boolean;
};

export function setupStatus(db: Db, config: Config): SetupStatus {
  return {
    needed: !readSettings(db).setupDone && isEmpty(db),
    serverTimeZone: config.serverTimeZone,
    demo: hasDemoData(db),
  };
}

/** Saves the choices and, on an empty install, adds example data if asked. */
export function finishSetup(db: Db, config: Config, input: SetupInput, actor: string): Settings {
  if (input.demo && !isEmpty(db)) {
    throw conflict("Hub already has data, so example data wasn't added. Finish without it.");
  }
  const saved = writeSettings(db, {
    modules: input.modules,
    timeZone: input.timeZone,
    setupDone: true,
  });
  applyTimeZone(config, saved);
  if (input.demo) {
    const today = localDateParts(new Date(), config.timeZone).date;
    seedDemo(db, actor, today);
  }
  return saved;
}
