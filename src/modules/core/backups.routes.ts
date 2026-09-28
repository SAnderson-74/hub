import { copyFileSync, createReadStream, createWriteStream, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { backupKind, backupTo, listBackups, preRestoreBackupName } from "../../server/db/backup";
import { stageRestore } from "../../server/db/restore";
import type { Deps } from "../../server/deps";
import type { AppEnv } from "../../server/env";
import { badRequest, conflict, notFound } from "../../server/errors";
import { log } from "../../server/log";
import { invalid } from "../../server/validate";

/** The biggest backup file that can be uploaded. */
export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;
/** Where an upload or a copy of a backup is checked before it's staged. */
export const CHECKING = "restore-checking.sqlite3";

const nameParam = zValidator(
  "param",
  z.object({ name: z.string().refine((name) => backupKind(name) !== null) }),
  invalid("That backup doesn't exist. Pick one from the list."),
);

/** Writes a request body to a file, refusing one bigger than MAX_UPLOAD_BYTES. */
async function saveUpload(body: ReadableStream<Uint8Array>, path: string) {
  let received = 0;
  const limit = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      received += chunk.length;
      done(received > MAX_UPLOAD_BYTES ? new Error("too large") : null, chunk);
    },
  });
  try {
    await pipeline(
      Readable.fromWeb(body as NodeReadableStream<Uint8Array>),
      limit,
      createWriteStream(path),
    );
  } catch {
    rmSync(path, { force: true });
    throw badRequest(
      received > MAX_UPLOAD_BYTES
        ? "That file is bigger than 500 MB, too big for a Hub backup."
        : "The upload didn't finish. Try again.",
    );
  }
  if (received === 0) {
    rmSync(path, { force: true });
    throw badRequest("Choose a backup file to upload.");
  }
}

/** Backups: list and download them, and restore one or an uploaded file. */
export function backupRoutes({ config, sqlite, restart }: Deps) {
  const checking = join(config.dataDir, CHECKING);
  const pathOf = (name: string) => {
    const path = join(config.backupDir, name);
    if (!existsSync(path)) throw notFound("That backup doesn't exist. It may have been pruned.");
    return path;
  };

  // One restore at a time, since they share the file being checked. Once one is
  // staged, Hub restarts and this starts over.
  let busy = false;
  /** Fills the file being checked, stages it, saves today's data, and restarts. */
  const restore = async (from: string, fill: () => Promise<void> | void) => {
    if (busy) throw conflict("A restore is already under way. Wait for Hub to restart.");
    busy = true;
    try {
      await fill();
      const check = await stageRestore(checking, config.dataDir, () =>
        backupTo(sqlite, config.backupDir, preRestoreBackupName()),
      );
      if (!check.ok) throw badRequest(check.reason);
    } catch (error) {
      busy = false;
      throw error;
    }
    log.info("Restore staged; restarting to finish it", { from });
    // After the answer goes out, so the page hears back before Hub stops.
    setTimeout(restart, 300);
    return { message: "Restoring. Hub is restarting, which takes up to a minute." };
  };

  return (
    new Hono<AppEnv>()
      .get("/", (c) =>
        c.json(
          listBackups(config.backupDir).map((backup) => ({
            name: backup.name,
            kind: backupKind(backup.name),
            sizeBytes: backup.sizeBytes,
            createdAt: backup.createdAt.toISOString(),
          })),
        ),
      )
      .get("/:name", nameParam, (c) => {
        const { name } = c.req.valid("param");
        const stream = Readable.toWeb(createReadStream(pathOf(name)));
        return c.body(stream as ReadableStream, 200, {
          "Content-Type": "application/vnd.sqlite3",
          "Content-Disposition": `attachment; filename="${name}"`,
        });
      })
      .post("/:name/restore", nameParam, async (c) => {
        const { name } = c.req.valid("param");
        const path = pathOf(name);
        return c.json(await restore("a listed backup", () => copyFileSync(path, checking)), 202);
      })
      // A backup file from elsewhere, like an offsite copy, sent as the raw request body.
      .post("/upload", async (c) => {
        const body = c.req.raw.body;
        if (!body) throw badRequest("Choose a backup file to upload.");
        return c.json(await restore("an uploaded file", () => saveUpload(body, checking)), 202);
      })
  );
}
