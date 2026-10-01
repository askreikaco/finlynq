/**
 * Multi-account session bundle management.
 *
 * Keeps the active session in `pf_session` (Path=/) and stashed inactive
 * sessions in `pf_accounts` (Path=/api/auth only, MRU order, max 4 entries,
 * cap 5 total). Each entry is a JWT stashed token. Integrity is JWT-signed;
 * tokens are pruned on read (expired/revoked/gen-mismatch/session_not_before).
 *
 * Core operations:
 * - readBundle(req) -> { active, stash: [{userId, jti, dekPresent, status, email?, displayName?, isAdmin?}] }
 * - commitSession(req, res, {token, jti, userId}) -> atomically swap active ↔ stash (MRU)
 * - activate(req, res, userId) -> promote a stashed userId to active (implies resolveSessionToken)
 * - removeAccount(req, res, userId|all) -> prune from stash or both
 */

import { NextRequest, NextResponse } from "next/server";
import { verifySessionTokenDetailed } from "./jwt";
import { getDEK } from "@/lib/crypto/dek-cache";
import { getUserById } from "./queries";

const ACTIVE_COOKIE = "pf_session";
const STASH_COOKIE = "pf_accounts";
const ADD_INTENT_COOKIE = "pf_add";

interface BundledToken {
  t: string; // JWT token
}

interface BundleEntry {
  userId: string;
  jti: string;
  dekPresent: boolean;
  status: "ok" | "expired" | "revoked" | "locked" | "pending";
  email?: string | null;
  displayName?: string | null;
  isAdmin: boolean;
  active?: boolean;
}

/**
 * Resolve and validate a session token. Returns status + decoded claims.
 * Used by switch/list/prune paths to check stashed tokens.
 *
 * Status codes:
 *   ok → token is valid and DEK is cached
 *   expired → token exp < now
 *   revoked → token is in the server-side denylist or session_not_before cutoff
 *   locked → DEK cache miss (can't decrypt data)
 *   pending → token is pending (awaiting MFA)
 */
export async function resolveSessionToken(
  token: string
): Promise<{
  userId: string | null;
  jti: string | null;
  dekPresent: boolean;
  status: "ok" | "expired" | "revoked" | "locked" | "pending";
}> {
  const { payload, reason } = await verifySessionTokenDetailed(token);

  if (!payload || !payload.sub) {
    // reason tells us which failure
    if (reason === "revoked") {
      return {
        userId: null,
        jti: null,
        dekPresent: false,
        status: "revoked",
      };
    }
    // "invalid-token" and "deploy-reauth-required" both map to expired
    return {
      userId: null,
      jti: null,
      dekPresent: false,
      status: "expired",
    };
  }

  if (payload.pending) {
    return {
      userId: payload.sub,
      jti: payload.jti as string | null,
      dekPresent: false,
      status: "pending",
    };
  }

  const jti = payload.jti as string | null;
  const dek = jti ? getDEK(jti, payload.sub) : null;

  return {
    userId: payload.sub,
    jti,
    dekPresent: Boolean(dek),
    status: dek ? "ok" : "locked",
  };
}

/**
 * Parse and validate the stash cookie. Returns parsed entries (MRU order),
 * pruned of invalid/revoked/expired tokens.
 *
 * If the cookie is malformed or missing, returns [].
 */
async function parseAndPruneStash(cookieValue: string | undefined): Promise<BundleEntry[]> {
  if (!cookieValue) return [];

  let parsed: BundledToken[] = [];
  try {
    const json = Buffer.from(cookieValue, "base64url").toString("utf-8");
    parsed = JSON.parse(json);
  } catch {
    // Malformed cookie — treat as empty
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  const entries: BundleEntry[] = [];
  const prunedTokens: string[] = [];

  for (const item of parsed) {
    if (typeof item.t !== "string") continue;

    const { userId, jti, dekPresent, status } = await resolveSessionToken(item.t);

    if (status === "ok" || status === "locked") {
      // Valid (possibly without DEK)
      const user = userId ? await getUserById(userId) : null;
      entries.push({
        userId: userId!,
        jti: jti!,
        dekPresent,
        status,
        email: user?.email,
        displayName: user?.displayName,
        isAdmin: user?.role === "admin" ? true : false,
      });
      prunedTokens.push(item.t);
    }
    // Skip expired/revoked/pending
  }

  // If the list shrank, the cookie will be rewritten on the next commit
  return entries;
}

/**
 * Read the current active token and stash from cookies.
 *
 * Returns { active, stash } where:
 *   active = { userId, jti, dekPresent, status, email, displayName, isAdmin } or null if no pf_session
 *   stash = [ { userId, jti, dekPresent, status, email, displayName, isAdmin } ] (MRU, pruned)
 */
export async function readBundle(request: NextRequest): Promise<{
  active: BundleEntry | null;
  stash: BundleEntry[];
}> {
  const activeToken = request.cookies.get(ACTIVE_COOKIE)?.value;
  const stashCookie = request.cookies.get(STASH_COOKIE)?.value;

  let active: BundleEntry | null = null;
  if (activeToken) {
    const { userId, jti, dekPresent, status } = await resolveSessionToken(activeToken);
    if (userId && jti) {
      const user = await getUserById(userId);
      active = {
        userId,
        jti,
        dekPresent,
        status,
        email: user?.email,
        displayName: user?.displayName,
        isAdmin: user?.role === "admin" ? true : false,
        active: true,
      };
    }
  }

  const stash = await parseAndPruneStash(stashCookie);
  return { active, stash };
}

/**
 * Encode a list of stashed tokens as base64url JSON.
 */
function encodeStash(tokens: string[]): string {
  const bundled: BundledToken[] = tokens.map((t) => ({ t }));
  const json = JSON.stringify(bundled);
  return Buffer.from(json, "utf-8").toString("base64url");
}

/**
 * Set the stash cookie on a NextResponse.
 */
function setStashCookie(response: NextResponse, tokens: string[]): void {
  if (tokens.length === 0) {
    // Empty stash — clear the cookie
    response.cookies.set(STASH_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/auth",
      maxAge: 0,
    });
  } else {
    const encoded = encodeStash(tokens);
    response.cookies.set(STASH_COOKIE, encoded, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/auth",
      maxAge: 24 * 60 * 60, // 24 hours, refreshed on write
    });
  }
}

/**
 * Set the active session cookie on a NextResponse.
 */
function setActiveCookie(response: NextResponse, token: string): void {
  response.cookies.set(ACTIVE_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 24 * 60 * 60, // 24 hours
    path: "/",
  });
}

/**
 * Atomically swap tokens between active and stash.
 *
 * If currentStash is null, the current active token is moved to stash.
 * If currentStash is [], the stash remains empty (no historical token).
 *
 * The new token becomes active (Path=/, sent to all routes).
 * The old active token is prepended to stash (MRU order) up to max 4 entries.
 * If the new user is already in the stash, that entry is removed (no duplicates).
 *
 * @param response NextResponse to mutate
 * @param newToken The new active token (already validated)
 * @param oldActiveToken The previous active token to move to stash (or null)
 * @param currentStash The current stash tokens (or null for first read)
 */
function commitBundleAtomically(
  response: NextResponse,
  newToken: string,
  oldActiveToken: string | null,
  currentStash: string[]
): void {
  // Build new stash: old active goes in front, cap at 4 entries
  let newStash = currentStash ? [...currentStash] : [];

  if (oldActiveToken) {
    newStash = [oldActiveToken, ...newStash];
  }

  // Cap at 4 entries (5 total including active)
  if (newStash.length > 4) {
    newStash = newStash.slice(0, 4);
  }

  // Set both cookies
  setActiveCookie(response, newToken);
  setStashCookie(response, newStash);
}

/**
 * Helper to extract stash tokens from the request cookie.
 */
async function getStashTokens(request: NextRequest): Promise<string[]> {
  const stashCookie = request.cookies.get(STASH_COOKIE)?.value;
  if (!stashCookie) return [];

  try {
    const json = Buffer.from(stashCookie, "base64url").toString("utf-8");
    const parsed = JSON.parse(json) as BundledToken[];
    return parsed.map((x) => x.t);
  } catch {
    return [];
  }
}

/**
 * Filter stash tokens to remove a specific userId.
 */
async function filterStashByUserId(tokens: string[], excludeUserId: string): Promise<string[]> {
  const result: string[] = [];
  for (const token of tokens) {
    const { userId } = await resolveSessionToken(token);
    if (userId !== excludeUserId) {
      result.push(token);
    }
  }
  return result;
}

/**
 * Find the original token for a specific userId in the stash tokens.
 */
async function findStashTokenByUserId(tokens: string[], targetUserId: string): Promise<string | null> {
  for (const token of tokens) {
    const { userId } = await resolveSessionToken(token);
    if (userId === targetUserId) {
      return token;
    }
  }
  return null;
}

/**
 * Commit a new session after login/MFA/Google/register.
 *
 * If pf_add cookie is present, move old active to stash, promote new token to active.
 * Otherwise (legacy replace), clear stash and replace active.
 *
 * De-duplicates: if this user is already in the stash or active, remove that entry first.
 *
 * @param request NextRequest (to read cookies)
 * @param response NextResponse (to write cookies)
 * @param options { token, jti, userId }
 */
export async function commitSession(
  request: NextRequest,
  response: NextResponse,
  options: { token: string; jti: string; userId: string }
): Promise<void> {
  const { token, userId } = options;

  const addIntentCookie = request.cookies.get(ADD_INTENT_COOKIE)?.value;
  const hasAddIntent = Boolean(addIntentCookie);

  const activeToken = request.cookies.get(ACTIVE_COOKIE)?.value;
  const stashTokens = await getStashTokens(request);

  if (hasAddIntent) {
    // Add flow: de-dupe this user, move old active to stash, activate new token
    const cleanedStash = await filterStashByUserId(stashTokens, userId);
    commitBundleAtomically(response, token, activeToken || null, cleanedStash);
  } else {
    // Legacy replace: clear stash, just set active
    commitBundleAtomically(response, token, null, []);
  }

  // Clear the add-intent cookie
  response.cookies.set(ADD_INTENT_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth",
    maxAge: 0,
  });
}

/**
 * Promote a stashed account to active (switch operation).
 *
 * Pre-requisite: the target token must already be in the stash and must
 * resolve to ok status (valid, DEK cached). This route will not create
 * a session; it only moves existing tokens.
 *
 * @param request NextRequest (to read cookies)
 * @param response NextResponse (to write cookies)
 * @param userId The target user to activate
 */
export async function activate(
  request: NextRequest,
  response: NextResponse,
  userId: string
): Promise<void> {
  const stashTokens = await getStashTokens(request);

  // Find the original token for this user in the stash
  const targetToken = await findStashTokenByUserId(stashTokens, userId);
  if (!targetToken) {
    throw new Error("Target user not in stash");
  }

  // Move old active to stash
  const activeToken = request.cookies.get(ACTIVE_COOKIE)?.value;

  // Remove target from stash (other stash tokens)
  const otherStashTokens = await filterStashByUserId(stashTokens, userId);

  commitBundleAtomically(response, targetToken, activeToken || null, otherStashTokens);
}

/**
 * Remove an account from the bundle (remove from stash and/or active).
 *
 * @param request NextRequest (to read cookies)
 * @param response NextResponse (to write cookies)
 * @param userIdOrAll The userId to remove, or "all" to clear both active + stash
 */
export async function removeAccount(
  request: NextRequest,
  response: NextResponse,
  userIdOrAll: string | "all"
): Promise<void> {
  const { active, stash } = await readBundle(request);

  if (userIdOrAll === "all") {
    // Clear everything
    response.cookies.set(ACTIVE_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });
    response.cookies.set(STASH_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/auth",
      maxAge: 0,
    });
  } else {
    // Remove just this userId
    const isActive = active?.userId === userIdOrAll;
    const inStash = stash.some((e) => e.userId === userIdOrAll);

    if (!isActive && !inStash) {
      // Nothing to remove
      return;
    }

    // Read and filter stash
    const stashTokens = await getStashTokens(request);
    const cleanedStash = await filterStashByUserId(stashTokens, userIdOrAll);

    if (isActive) {
      // Remove active + set next stashed as active
      if (cleanedStash.length > 0) {
        const nextActiveToken = cleanedStash[0];
        const remainingStash = cleanedStash.slice(1);
        commitBundleAtomically(response, nextActiveToken, null, remainingStash);
      } else {
        // No stash left — clear everything
        response.cookies.set(ACTIVE_COOKIE, "", {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          maxAge: 0,
          path: "/",
        });
        setStashCookie(response, []);
      }
    } else {
      // Just remove from stash
      setStashCookie(response, cleanedStash);
    }
  }
}
