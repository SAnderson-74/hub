// This browser's side of notifications: whether it can have them, and turning them on
// or off here. The service worker (public/sw.js) is registered only when they're on.

export type Support =
  | { ok: true }
  /** An iPhone or iPad browser tab: push works only from the Home Screen app. */
  | { ok: false; reason: "home-screen" }
  | { ok: false; reason: "unsupported" }
  /** The person blocked notifications for Hub in the browser's settings. */
  | { ok: false; reason: "blocked" };

const isAppleMobile = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  // iPadOS reports itself as a Mac with a touch screen.
  (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1);

const standalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

export function pushSupport(): Support {
  const capable =
    "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (isAppleMobile() && !standalone()) return { ok: false, reason: "home-screen" };
  if (!capable) return { ok: false, reason: "unsupported" };
  if (Notification.permission === "denied") return { ok: false, reason: "blocked" };
  return { ok: true };
}

/** A starting name for this device, which the person can change. */
export function deviceName(): string {
  const agent = navigator.userAgent;
  if (/iPhone/.test(agent)) return "iPhone";
  if (/iPad/.test(agent) || (agent.includes("Macintosh") && navigator.maxTouchPoints > 1))
    return "iPad";
  if (/Android/.test(agent)) return "Android";
  if (/Macintosh/.test(agent)) return "Mac";
  if (/Windows/.test(agent)) return "Windows";
  return "This browser";
}

/** This browser's current subscription, if notifications are on here. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator)) return null;
  const registration = await navigator.serviceWorker.getRegistration("/");
  return (await registration?.pushManager.getSubscription()) ?? null;
}

/** SHA-256 of an endpoint, base64url, to match the server's list without sending it there. */
export async function endpointHash(endpoint: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
  let text = "";
  for (const byte of new Uint8Array(digest)) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const text = atob(base64url.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(text.length));
  for (let index = 0; index < text.length; index += 1) bytes[index] = text.charCodeAt(index);
  return bytes;
}

export class PushError extends Error {}

/**
 * Asks for permission, registers the service worker, and subscribes with Hub's public
 * key. Answers with what the server needs to send here.
 */
export async function subscribeHere(publicKey: string) {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new PushError(
      permission === "denied"
        ? "Notifications are blocked for Hub. Allow them in this device's settings, then try again."
        : "Notifications weren't allowed, so nothing changed.",
    );
  }
  const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(publicKey),
    }));
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
    throw new PushError(
      "This browser didn't give a push address. Try again, or use another browser.",
    );
  }
  return { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } };
}

/** Stops notifications in this browser. */
export async function unsubscribeHere(): Promise<void> {
  const subscription = await currentSubscription();
  await subscription?.unsubscribe();
}
