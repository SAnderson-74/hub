import type { Settings } from "../shared/settings";
import type { Config } from "./config";

/**
 * Uses the time zone chosen in Settings, or the server's own when none is. Called at
 * startup and whenever settings are saved, so a change applies without a restart.
 */
export function applyTimeZone(config: Config, settings: Pick<Settings, "timeZone">): void {
  config.timeZone = settings.timeZone || config.serverTimeZone;
}
