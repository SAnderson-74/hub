import {
  createCipheriv,
  createECDH,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  hkdfSync,
  type KeyObject,
  randomBytes,
  sign,
} from "node:crypto";

// Web Push on Node's own crypto, so there's no third-party code in the path:
// - RFC 8291 encrypts each message for one device. The push service carries only
//   ciphertext; it can't read what Hub sends.
// - RFC 8292 (VAPID) signs each request, so a push service only delivers to a device
//   from the server that device subscribed with.
// - Messages only go to the push services browsers use (PUSH_HOSTS), over HTTPS, with
//   no redirects followed. Nothing ever connects to Hub: sending is outbound only.

/** The push services browsers use: Apple, Google (Chrome, Android), Mozilla, Microsoft. */
const PUSH_HOSTS = new Set([
  "web.push.apple.com",
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
]);
const PUSH_HOST_SUFFIXES = [".notify.windows.com"];

/**
 * Whether an endpoint is one of the push services Hub sends to: HTTPS on the standard
 * port, on a known host. Anything else is refused, so a subscription can't point Hub
 * at another address.
 */
export function pushHostAllowed(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.port !== "" || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return PUSH_HOSTS.has(host) || PUSH_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

export const toBase64Url = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");
export const fromBase64Url = (text: string) => Buffer.from(text, "base64url");

export type VapidKeys = { publicKey: string; privateKey: string };

/** A new P-256 key pair for signing: the public key as browsers want it (65 bytes, base64url). */
export function generateVapidKeys(): VapidKeys {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = publicKey.export({ format: "jwk" });
  const point = Buffer.concat([
    Buffer.from([4]),
    fromBase64Url(jwk.x ?? ""),
    fromBase64Url(jwk.y ?? ""),
  ]);
  return {
    publicKey: toBase64Url(point),
    privateKey: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
  };
}

/** A device's public key must be an uncompressed P-256 point. */
export function validDeviceKey(p256dh: string, auth: string): boolean {
  const key = fromBase64Url(p256dh);
  if (key.length !== 65 || key[0] !== 4 || fromBase64Url(auth).length !== 16) return false;
  try {
    createPublicKey({
      key: {
        kty: "EC",
        crv: "P-256",
        x: toBase64Url(key.subarray(1, 33)),
        y: toBase64Url(key.subarray(33)),
      },
      format: "jwk",
    });
    return true;
  } catch {
    return false;
  }
}

function newServerKey() {
  const key = createECDH("prime256v1");
  key.generateKeys();
  return key;
}

/** The record size Hub writes; one record holds a whole message. */
const RECORD_SIZE = 4096;

/**
 * Encrypts a message for one device (RFC 8291, aes128gcm). `serverKey` and `salt` are
 * new for every message; they're parameters only so the RFC's example can be checked.
 */
export function encrypt(
  plaintext: Uint8Array,
  device: { p256dh: string; auth: string },
  serverKey = newServerKey(),
  salt: Uint8Array = randomBytes(16),
): Buffer {
  const devicePublic = fromBase64Url(device.p256dh);
  const serverPublic = serverKey.getPublicKey();
  const shared = serverKey.computeSecret(devicePublic);
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), devicePublic, serverPublic]);
  const ikm = Buffer.from(hkdfSync("sha256", shared, fromBase64Url(device.auth), keyInfo, 32));
  const cek = Buffer.from(
    hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16),
  );
  const nonce = Buffer.from(
    hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12),
  );
  // One record: the message, then 0x02 to mark it as the last.
  const padded = Buffer.concat([Buffer.from(plaintext), Buffer.from([2])]);
  if (padded.length + 16 > RECORD_SIZE) throw new Error("Push message too long");
  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const body = Buffer.concat([cipher.update(padded), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.alloc(21);
  Buffer.from(salt).copy(header, 0);
  header.writeUInt32BE(RECORD_SIZE, 16);
  header.writeUInt8(serverPublic.length, 20);
  return Buffer.concat([header, serverPublic, body]);
}

/** The VAPID Authorization header for a request to `endpoint`, good for twelve hours. */
export function vapidHeader(endpoint: string, keys: VapidKeys, contact: string, now: Date): string {
  const audience = new URL(endpoint).origin;
  const encode = (value: object) => toBase64Url(Buffer.from(JSON.stringify(value)));
  const unsigned = `${encode({ typ: "JWT", alg: "ES256" })}.${encode({
    aud: audience,
    exp: Math.floor(now.getTime() / 1000) + 12 * 60 * 60,
    sub: contact,
  })}`;
  const key: KeyObject = createPrivateKey(keys.privateKey);
  // JWS wants the raw r || s signature, not DER.
  const signature = sign("sha256", Buffer.from(unsigned), { key, dsaEncoding: "ieee-p1363" });
  return `vapid t=${unsigned}.${toBase64Url(signature)}, k=${keys.publicKey}`;
}

export type PushResult =
  | { ok: true; status: number }
  /** `gone`: the device unsubscribed or the subscription expired, so it should be removed. */
  | { ok: false; status: number | null; gone: boolean; code: string };

const SEND_TIMEOUT_MS = 10_000;

/** Sends one encrypted message to one device's push service. */
export async function sendPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: object,
  keys: VapidKeys,
  contact: string,
  now = new Date(),
  { ttlSeconds = 24 * 60 * 60, topic }: { ttlSeconds?: number; topic?: string } = {},
): Promise<PushResult> {
  // Checked again on every send, not only when the device subscribed.
  if (!pushHostAllowed(subscription.endpoint)) {
    return { ok: false, status: null, gone: true, code: "HOST_NOT_ALLOWED" };
  }
  const body = encrypt(Buffer.from(JSON.stringify(payload)), subscription);
  try {
    const res = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        Authorization: vapidHeader(subscription.endpoint, keys, contact, now),
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: String(ttlSeconds),
        Urgency: "normal",
        ...(topic ? { Topic: topic } : {}),
      },
      body: new Uint8Array(body),
      redirect: "error",
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (res.ok) return { ok: true, status: res.status };
    return {
      ok: false,
      status: res.status,
      gone: res.status === 404 || res.status === 410,
      code: `HTTP_${res.status}`,
    };
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    const cause =
      error instanceof Error ? (error.cause as { code?: unknown } | undefined) : undefined;
    return {
      ok: false,
      status: null,
      gone: false,
      code: timedOut ? "TIMEOUT" : typeof cause?.code === "string" ? cause.code : "UNKNOWN",
    };
  }
}
