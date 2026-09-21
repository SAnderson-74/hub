type Level = "debug" | "info" | "warn" | "error";
type Fields = Record<string, unknown>;

/**
 * One JSON object per line, so TrueNAS / `docker logs` output stays greppable.
 * Never log request bodies or financial values.
 */
function write(level: Level, message: string, fields?: Fields): void {
  if (process.env.NODE_ENV === "test" && level === "debug") return;
  const line = JSON.stringify({ time: new Date().toISOString(), level, message, ...fields });
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}

export const log = {
  debug: (message: string, fields?: Fields) => write("debug", message, fields),
  info: (message: string, fields?: Fields) => write("info", message, fields),
  warn: (message: string, fields?: Fields) => write("warn", message, fields),
  error: (message: string, fields?: Fields) => write("error", message, fields),
};

export function errorFields(error: unknown): Fields {
  if (error instanceof Error) return { error: error.message, stack: error.stack };
  return { error: String(error) };
}
