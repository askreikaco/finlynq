/**
 * Carries a Family Wealth invite token across the logged-out -> sign-in -> back hop WITHOUT ever
 * putting it in another URL. The token lives only in sessionStorage (tab-scoped, same-origin, never
 * sent anywhere) as {token, ts}; it is read once and deleted immediately. Never log it.
 */
export const INVITE_STASH_KEY = "pf-family-invite";
export const INVITE_STASH_TTL_MS = 30 * 60 * 1000;
export const INVITE_RETURN_PATH = "/family/accept";

function isInvitePath(pathname: string): boolean {
  return pathname === "/family" || pathname === "/family/" || pathname === INVITE_RETURN_PATH || pathname === `${INVITE_RETURN_PATH}/`;
}

/** Remove `token` from the address bar (history entry replaced, other params/hash kept). */
export function stripTokenFromAddressBar(): string | null {
  const url = new URL(window.location.href);
  const t = url.searchParams.get("token");
  if (!t) return null;
  url.searchParams.delete("token");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  return t;
}

export function clearInviteStash(): void {
  try {
    window.sessionStorage.removeItem(INVITE_STASH_KEY);
  } catch {
    /* storage blocked */
  }
}

/**
 * Logged-out entry on an invite page: stash the token, strip it from the URL.
 * Returns true when a token was stashed (caller then redirects to the token-free return path).
 */
export function stashInviteFromLocation(now: number = Date.now()): boolean {
  if (typeof window === "undefined" || !isInvitePath(window.location.pathname)) return false;
  const token = stripTokenFromAddressBar();
  if (!token) return false;
  try {
    window.sessionStorage.setItem(INVITE_STASH_KEY, JSON.stringify({ token, ts: now }));
    return true;
  } catch {
    return false;
  }
}

/** Read the stashed token once: deletes it immediately; null when missing, malformed or > 30 min old. */
export function consumeInviteStash(now: number = Date.now()): string | null {
  let raw: string | null = null;
  try {
    raw = window.sessionStorage.getItem(INVITE_STASH_KEY);
  } catch {
    return null;
  }
  clearInviteStash();
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { token?: unknown; ts?: unknown };
    if (typeof v.token !== "string" || !v.token || typeof v.ts !== "number") return null;
    const age = now - v.ts;
    if (age < 0 || age > INVITE_STASH_TTL_MS) return null;
    return v.token;
  } catch {
    return null;
  }
}
