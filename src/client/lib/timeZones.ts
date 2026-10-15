/** The browser's own time zone, like "America/Chicago". */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "";
  }
}

/** Every time zone the browser knows, sorted, always including `extra`. */
export function timeZoneOptions(...extra: string[]): string[] {
  let zones: string[] = [];
  try {
    zones = Intl.supportedValuesOf("timeZone");
  } catch {
    zones = [];
  }
  return [...new Set([...zones, ...extra.filter(Boolean)])].sort();
}

/** "America/New_York" as "America / New York". */
export const timeZoneLabel = (zone: string) => zone.replace(/_/g, " ").replace(/\//g, " / ");
