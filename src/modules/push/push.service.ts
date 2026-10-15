import { createHash } from "node:crypto";
import { count, eq } from "drizzle-orm";
import type { Queryable } from "../../server/db/client";
import { badRequest, conflict, notFound } from "../../server/errors";
import { log } from "../../server/log";
import {
  MAX_DEVICES,
  type PushMessage,
  type PushSubscribe,
  type PushUpdate,
} from "../../shared/push";
import { pushKeys, pushSubscriptions } from "./schema";
import {
  generateVapidKeys,
  pushHostAllowed,
  sendPush,
  type VapidKeys,
  validDeviceKey,
} from "./webpush";

/**
 * The contact push services see in each request's signed token (RFC 8292 asks for one,
 * and Apple requires it). A neutral address: nothing about the owner leaves Hub.
 */
const CONTACT = "mailto:admin@example.com";

export type PushDeviceJson = {
  id: number;
  name: string;
  /** The push service, like "web.push.apple.com". */
  service: string;
  details: boolean;
  createdAt: string;
  lastSentAt: string | null;
  lastError: string | null;
  /**
   * SHA-256 of the endpoint, so a browser can tell which device is itself without the
   * server handing out push addresses.
   */
  endpointHash: string;
};

export type PushStatusJson = {
  /** Null until a device first turns notifications on. */
  publicKey: string | null;
  devices: PushDeviceJson[];
};

const hashOf = (endpoint: string) => createHash("sha256").update(endpoint).digest("base64url");

function readKeys(db: Queryable): VapidKeys | null {
  const row = db.select().from(pushKeys).where(eq(pushKeys.id, 1)).get();
  return row ? { publicKey: row.publicKey, privateKey: row.privateKey } : null;
}

/** The signing keys, made the first time they're needed. Answers with the public one. */
export function prepareKeys(db: Queryable): { publicKey: string } {
  const existing = readKeys(db);
  if (existing) return { publicKey: existing.publicKey };
  const keys = generateVapidKeys();
  db.insert(pushKeys)
    .values({ id: 1, ...keys })
    .onConflictDoNothing()
    .run();
  return { publicKey: readKeys(db)?.publicKey ?? keys.publicKey };
}

function toJson(row: typeof pushSubscriptions.$inferSelect): PushDeviceJson {
  return {
    id: row.id,
    name: row.name,
    service: new URL(row.endpoint).hostname,
    details: row.details,
    createdAt: row.createdAt.toISOString(),
    lastSentAt: row.lastSentAt?.toISOString() ?? null,
    lastError: row.lastError,
    endpointHash: hashOf(row.endpoint),
  };
}

export function pushStatus(db: Queryable): PushStatusJson {
  return {
    publicKey: readKeys(db)?.publicKey ?? null,
    devices: db.select().from(pushSubscriptions).orderBy(pushSubscriptions.id).all().map(toJson),
  };
}

export function hasDevices(db: Queryable): boolean {
  return (db.select({ n: count() }).from(pushSubscriptions).get()?.n ?? 0) > 0;
}

/** Turns notifications on for a device, or refreshes its keys if it's already on. */
export function subscribe(db: Queryable, input: PushSubscribe): PushDeviceJson {
  if (!readKeys(db)) throw badRequest("Push isn't set up yet. Turn notifications on again.");
  if (!pushHostAllowed(input.endpoint)) {
    throw badRequest(
      "That push service isn't one Hub sends to. Use Safari, Chrome, Edge, or Firefox.",
    );
  }
  if (!validDeviceKey(input.keys.p256dh, input.keys.auth)) {
    throw badRequest("That device's push keys aren't valid. Turn notifications off and on again.");
  }
  const existing = db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, input.endpoint))
    .get();
  const name = (input.name ?? "").trim();
  if (existing) {
    const row = db
      .update(pushSubscriptions)
      .set({
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        ...(name ? { name } : {}),
        lastError: null,
      })
      .where(eq(pushSubscriptions.id, existing.id))
      .returning()
      .get();
    return toJson(row);
  }
  if ((db.select({ n: count() }).from(pushSubscriptions).get()?.n ?? 0) >= MAX_DEVICES) {
    throw conflict(`Notifications are on for ${MAX_DEVICES} devices already. Turn one off first.`);
  }
  const row = db
    .insert(pushSubscriptions)
    .values({ endpoint: input.endpoint, p256dh: input.keys.p256dh, auth: input.keys.auth, name })
    .returning()
    .get();
  return toJson(row);
}

function requireDevice(db: Queryable, id: number) {
  const row = db.select().from(pushSubscriptions).where(eq(pushSubscriptions.id, id)).get();
  if (!row) throw notFound("That device doesn't have notifications on any more.");
  return row;
}

export function updateDevice(db: Queryable, id: number, patch: PushUpdate): PushDeviceJson {
  requireDevice(db, id);
  const row = db
    .update(pushSubscriptions)
    .set(patch)
    .where(eq(pushSubscriptions.id, id))
    .returning()
    .get();
  return toJson(row);
}

export function removeDevice(db: Queryable, id: number): void {
  requireDevice(db, id);
  db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, id)).run();
}

export type PushOutcome = { sent: number; failed: number; removed: number; detail: string };

/** What a failure code means, in words, for Settings. */
function failureText(code: string): string {
  if (code === "TIMEOUT") return "The push service didn't answer within 10 seconds.";
  if (code === "HTTP_403" || code === "HTTP_401") {
    return "The push service refused Hub's signature. Turn notifications off and on again on that device.";
  }
  if (code.startsWith("HTTP_")) return `The push service answered ${code.slice(5)}.`;
  return "Couldn't reach the push service. Check that Hub can reach the internet.";
}

/**
 * Sends a message to every device with notifications on, or to one. Devices that
 * unsubscribed are removed. Logs only counts and codes: never addresses or content.
 */
export async function pushToDevices(
  db: Queryable,
  message: PushMessage,
  now = new Date(),
  onlyId?: number,
): Promise<PushOutcome> {
  const keys = readKeys(db);
  const devices = onlyId ? [requireDevice(db, onlyId)] : db.select().from(pushSubscriptions).all();
  const outcome: PushOutcome = { sent: 0, failed: 0, removed: 0, detail: "" };
  if (!keys || devices.length === 0) return outcome;
  const failures: string[] = [];
  for (const device of devices) {
    const shown = device.details ? message : { ...message, ...message.brief };
    const result = await sendPush(
      device,
      { title: shown.title, body: shown.body, tag: message.tag, url: message.url },
      keys,
      CONTACT,
      now,
      { topic: message.tag.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || undefined },
    );
    if (result.ok) {
      outcome.sent += 1;
      db.update(pushSubscriptions)
        .set({ lastSentAt: now, lastError: null })
        .where(eq(pushSubscriptions.id, device.id))
        .run();
    } else if (result.gone) {
      outcome.removed += 1;
      db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, device.id)).run();
    } else {
      outcome.failed += 1;
      failures.push(result.code);
      db.update(pushSubscriptions)
        .set({ lastError: result.code })
        .where(eq(pushSubscriptions.id, device.id))
        .run();
    }
  }
  outcome.detail =
    failures.length > 0
      ? failureText(failures[0] ?? "UNKNOWN")
      : outcome.sent > 0
        ? `Sent to ${outcome.sent} ${outcome.sent === 1 ? "device" : "devices"}.`
        : "That device had turned notifications off, so it was removed.";
  if (outcome.failed > 0 || outcome.removed > 0) {
    log.warn("Push partly failed", {
      sent: outcome.sent,
      failed: outcome.failed,
      removed: outcome.removed,
      code: failures[0] ?? "",
    });
  } else {
    log.info("Push sent", { sent: outcome.sent });
  }
  return outcome;
}
