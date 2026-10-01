"use client";

/**
 * Auto-passkey bookkeeping for /cloud.
 *  - hint (localStorage): this device has a passkey that signed in / registered.
 *  - skip (sessionStorage): suppress auto-start (cancel, failure, sign-out).
 */

export const PASSKEY_HINT_KEY = "pf-passkey-hint";
export const PASSKEY_AUTO_SKIP_KEY = "pf-passkey-auto-skip";

export function setPasskeyHint(): void {
  try {
    localStorage.setItem(PASSKEY_HINT_KEY, "1");
  } catch {
    /* storage blocked */
  }
}

export function setPasskeyAutoSkip(): void {
  try {
    sessionStorage.setItem(PASSKEY_AUTO_SKIP_KEY, "1");
  } catch {
    /* storage blocked */
  }
}

export function clearPasskeyAutoSkip(): void {
  try {
    sessionStorage.removeItem(PASSKEY_AUTO_SKIP_KEY);
  } catch {
    /* storage blocked */
  }
}

export function isPasskeyAutoAllowed(): boolean {
  try {
    return (
      sessionStorage.getItem(PASSKEY_AUTO_SKIP_KEY) !== "1" &&
      localStorage.getItem(PASSKEY_HINT_KEY) === "1"
    );
  } catch {
    return false;
  }
}
