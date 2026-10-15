import { createECDH, createPublicKey, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptPush } from "./testDevice";
import {
  encrypt,
  fromBase64Url,
  generateVapidKeys,
  pushHostAllowed,
  toBase64Url,
  validDeviceKey,
  vapidHeader,
} from "./webpush";

/** RFC 8291, Appendix A: the example message and the keys it was made with. */
const RFC = {
  plaintext: "When I grow up, I want to be a watermelon",
  serverPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  devicePrivate: "q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94",
  devicePublic:
    "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  auth: "BTBZMqHH6r4Tts7J_aSIgg",
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  message:
    "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
};

describe("web push encryption", () => {
  it("matches the RFC 8291 example exactly", () => {
    const server = createECDH("prime256v1");
    server.setPrivateKey(fromBase64Url(RFC.serverPrivate));
    const message = encrypt(
      Buffer.from(RFC.plaintext),
      { p256dh: RFC.devicePublic, auth: RFC.auth },
      server,
      fromBase64Url(RFC.salt),
    );
    expect(toBase64Url(message)).toBe(RFC.message);
  });

  it("uses new keys and salt every time, and the device can read it", () => {
    const device = createECDH("prime256v1");
    device.generateKeys();
    const keys = {
      p256dh: toBase64Url(device.getPublicKey()),
      auth: toBase64Url(Buffer.alloc(16, 7)),
    };
    const first = encrypt(Buffer.from('{"title":"Hub"}'), keys);
    const second = encrypt(Buffer.from('{"title":"Hub"}'), keys);
    expect(first.equals(second)).toBe(false);
    expect(decryptPush(first, toBase64Url(device.getPrivateKey()), keys.auth)).toBe(
      '{"title":"Hub"}',
    );
  });
});

describe("where pushes may go", () => {
  it("allows only the browsers' push services, over HTTPS", () => {
    for (const endpoint of [
      "https://web.push.apple.com/QGxPMk4B",
      "https://fcm.googleapis.com/fcm/send/abc",
      "https://updates.push.services.mozilla.com/wpush/v2/abc",
      "https://wns2-bl2p.notify.windows.com/w/?token=abc",
    ]) {
      expect(pushHostAllowed(endpoint), endpoint).toBe(true);
    }
    for (const endpoint of [
      "http://web.push.apple.com/abc",
      "https://web.push.apple.com:8443/abc",
      "https://user:pass@web.push.apple.com/abc",
      "https://web.push.apple.com.example.com/abc",
      "https://example.com/web.push.apple.com",
      "https://192.168.1.10/abc",
      "https://notify.windows.com.example.com/abc",
      "not a url",
    ]) {
      expect(pushHostAllowed(endpoint), endpoint).toBe(false);
    }
  });

  it("accepts only real P-256 device keys", () => {
    const device = createECDH("prime256v1");
    device.generateKeys();
    const auth = toBase64Url(Buffer.alloc(16, 1));
    expect(validDeviceKey(toBase64Url(device.getPublicKey()), auth)).toBe(true);
    expect(validDeviceKey(toBase64Url(device.getPublicKey()), toBase64Url(Buffer.alloc(8)))).toBe(
      false,
    );
    const offCurve = Buffer.alloc(65, 1);
    offCurve[0] = 4;
    expect(validDeviceKey(toBase64Url(offCurve), auth)).toBe(false);
  });
});

describe("VAPID", () => {
  it("signs a short-lived token for the push service's origin", () => {
    const keys = generateVapidKeys();
    expect(fromBase64Url(keys.publicKey)).toHaveLength(65);
    const now = new Date("2030-03-01T12:00:00Z");
    const header = vapidHeader(
      "https://web.push.apple.com/abc",
      keys,
      "mailto:admin@example.com",
      now,
    );
    const match = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header);
    expect(match).not.toBeNull();
    const [, head = "", claims = "", signature = "", k] = match ?? [];
    expect(k).toBe(keys.publicKey);
    expect(JSON.parse(fromBase64Url(head).toString())).toEqual({ typ: "JWT", alg: "ES256" });
    expect(JSON.parse(fromBase64Url(claims).toString())).toEqual({
      aud: "https://web.push.apple.com",
      exp: Math.floor(now.getTime() / 1000) + 12 * 60 * 60,
      sub: "mailto:admin@example.com",
    });
    const point = fromBase64Url(keys.publicKey);
    const publicKey = createPublicKey({
      key: {
        kty: "EC",
        crv: "P-256",
        x: toBase64Url(point.subarray(1, 33)),
        y: toBase64Url(point.subarray(33)),
      },
      format: "jwk",
    });
    expect(
      verify(
        "sha256",
        Buffer.from(`${head}.${claims}`),
        { key: publicKey, dsaEncoding: "ieee-p1363" },
        fromBase64Url(signature),
      ),
    ).toBe(true);
  });
});
