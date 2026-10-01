/**
 * Per-device UI preference: accounts hidden from the More "Account" list and
 * the desktop account menu. They stay signed in; no cookie/server effect.
 * Device-level key (not namespaced per user): the set is a list of userIds.
 */
export const HIDDEN_ACCOUNTS_KEY = "pf-hidden-accounts";

export function readHiddenAccounts(): string[] {
  try {
    const raw = localStorage.getItem(HIDDEN_ACCOUNTS_KEY);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function writeHiddenAccounts(ids: string[]): void {
  try {
    localStorage.setItem(HIDDEN_ACCOUNTS_KEY, JSON.stringify([...new Set(ids)]));
  } catch {
    // storage blocked: preference simply does not persist
  }
}

/** The active account is never hidden. */
export function isHiddenAccount(a: { userId: string; active: boolean }, hidden: string[]): boolean {
  return !a.active && hidden.includes(a.userId);
}
