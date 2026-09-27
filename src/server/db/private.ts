import { chmodSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { errorFields, log } from "../log";

/**
 * Makes the data folder readable by the app's user only: 700 for folders and 600
 * for files (the database, its WAL files, and backups). Covers files made before
 * the server started setting a private umask. Other accounts on the host can't
 * read them; root and snapshot or cloud sync tasks still can.
 */
export function makePrivate(dataDir: string): void {
  const visit = (path: string, depth: number) => {
    let isDir: boolean;
    try {
      isDir = statSync(path).isDirectory();
      chmodSync(path, isDir ? 0o700 : 0o600);
    } catch (error) {
      log.warn("Couldn't make a data file private", { path, ...errorFields(error) });
      return;
    }
    if (isDir && depth < 2) {
      for (const name of readdirSync(path)) visit(join(path, name), depth + 1);
    }
  };
  visit(dataDir, 0);
}
