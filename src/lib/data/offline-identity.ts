/**
 * Who this browser was last signed in as, and its trusted-device id, kept ONLY while Offline mode is on, so the app can
 * open with no network (cold start in airplane mode): without it, the sign-in check cannot run and the app would treat
 * the user as signed out and redirect to a login page it cannot load either.
 *
 * It grants no access by itself: it only lets the shell open and read the on-device copy. Every request to the server
 * still needs the real session cookie, and the real session check runs again as soon as the network is back. It holds
 * ids only (no name, email or token), expires after 30 days, and is cleared with every on-device wipe (sign-out,
 * lock, untrusted device, Offline mode off). Per-browser localStorage, never sent anywhere.
 */
import { isLocalWriteQueueEnabled } from "@/lib/local-first/write-path/flag";

export const OFFLINE_IDENTITY_KEY = "finlynq.lf.identity";
export const OFFLINE_IDENTITY_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
/** The display currency (3-letter code) last seen online: every cached API key carries it, so offline pages need the same one. */
export const OFFLINE_CURRENCY_KEY = "finlynq.lf.displayCurrency";

export interface OfflineIdentity {
  userId: string;
  deviceId: string;
  /** Epoch ms of the last online verification. */
  at: number;
}

function store(): Storage | null {
  try {
    return typeof window === "undefined" ? null : (window.localStorage ?? null);
  } catch {
    return null;
  }
}

/** Remembers the identity after an online check confirmed a trusted device. No-op while Offline mode is off. */
export function rememberOfflineIdentity(id: { userId: string; deviceId: string }, now: number = Date.now()): void {
  if (!isLocalWriteQueueEnabled()) return;
  const s = store();
  if (!s || !id.userId || !id.deviceId) return;
  try {
    s.setItem(OFFLINE_IDENTITY_KEY, JSON.stringify({ userId: id.userId, deviceId: id.deviceId, at: now } satisfies OfflineIdentity));
  } catch {
    // storage full or blocked: offline cold start simply is not available
  }
}

/** The remembered identity, or null: offline mode off, nothing remembered, malformed, or older than 30 days. */
export function readOfflineIdentity(now: number = Date.now()): OfflineIdentity | null {
  if (!isLocalWriteQueueEnabled()) return null;
  const s = store();
  if (!s) return null;
  try {
    const raw = s.getItem(OFFLINE_IDENTITY_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<OfflineIdentity> | null;
    if (!v || typeof v.userId !== "string" || typeof v.deviceId !== "string" || typeof v.at !== "number" || !v.userId || !v.deviceId) {
      s.removeItem(OFFLINE_IDENTITY_KEY);
      return null;
    }
    if (now - v.at > OFFLINE_IDENTITY_MAX_AGE_MS || v.at > now + 60_000) {
      s.removeItem(OFFLINE_IDENTITY_KEY);
      return null;
    }
    return { userId: v.userId, deviceId: v.deviceId, at: v.at };
  } catch {
    return null;
  }
}

export function forgetOfflineIdentity(): void {
  try {
    store()?.removeItem(OFFLINE_IDENTITY_KEY);
    store()?.removeItem(OFFLINE_CURRENCY_KEY);
  } catch {
    // nothing to do
  }
}

/** Remembers the display currency while Offline mode is on (no-op otherwise). */
export function rememberOfflineCurrency(code: string): void {
  if (!isLocalWriteQueueEnabled() || !/^[A-Z]{3}$/.test(code)) return;
  try {
    store()?.setItem(OFFLINE_CURRENCY_KEY, code);
  } catch {
    // storage full or blocked
  }
}

/** The remembered display currency, or null (Offline mode off, nothing remembered, or malformed). */
export function readOfflineCurrency(): string | null {
  if (!isLocalWriteQueueEnabled()) return null;
  try {
    const v = store()?.getItem(OFFLINE_CURRENCY_KEY) ?? null;
    return v && /^[A-Z]{3}$/.test(v) ? v : null;
  } catch {
    return null;
  }
}
