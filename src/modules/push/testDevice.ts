import { createDecipheriv, createECDH, hkdfSync, randomBytes } from "node:crypto";
import { fromBase64Url, toBase64Url } from "./webpush";

// For tests: a pretend device with its own push keys, able to read what Hub sends it.

/** Reads a message the way a device does (RFC 8291), from its private key and auth secret. */
export function decryptPush(message: Uint8Array, devicePrivate: string, auth: string): string {
  const bytes = Buffer.from(message);
  const salt = bytes.subarray(0, 16);
  const idLength = bytes.readUInt8(20);
  const serverPublic = bytes.subarray(21, 21 + idLength);
  const body = bytes.subarray(21 + idLength);
  const device = createECDH("prime256v1");
  device.setPrivateKey(fromBase64Url(devicePrivate));
  const shared = device.computeSecret(serverPublic);
  const info = Buffer.concat([Buffer.from("WebPush: info\0"), device.getPublicKey(), serverPublic]);
  const ikm = Buffer.from(hkdfSync("sha256", shared, fromBase64Url(auth), info, 32));
  const derive = (label: string, length: number) =>
    Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from(`Content-Encoding: ${label}\0`), length));
  const decipher = createDecipheriv("aes-128-gcm", derive("aes128gcm", 16), derive("nonce", 12));
  decipher.setAuthTag(body.subarray(body.length - 16));
  const padded = Buffer.concat([
    decipher.update(body.subarray(0, body.length - 16)),
    decipher.final(),
  ]);
  if (padded.at(-1) !== 2) throw new Error("Not the last record");
  return padded.subarray(0, padded.length - 1).toString();
}

/** A new device subscribed at an Apple-style endpoint. */
export function testDevice(
  endpoint = `https://web.push.apple.com/${toBase64Url(randomBytes(12))}`,
) {
  const key = createECDH("prime256v1");
  key.generateKeys();
  const auth = toBase64Url(randomBytes(16));
  const p256dh = toBase64Url(key.getPublicKey());
  const privateKey = toBase64Url(key.getPrivateKey());
  return {
    subscription: { endpoint, keys: { p256dh, auth } },
    read: (message: Uint8Array) => JSON.parse(decryptPush(message, privateKey, auth)),
  };
}
