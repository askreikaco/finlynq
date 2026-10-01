/**
 * Multi-account session bundle (plan: .plan-multiacct.md §2-§5).
 *
 * pf_session  = ACTIVE token (Path=/, read by middleware/strategies/mobile; unchanged)
 * pf_accounts = INACTIVE tokens (Path=/api/auth only), base64url(JSON [{t:jwt}]), MRU, max 4 (cap 5 total)
 * pf_add      = short-lived signed "add another account" intent (Path=/api/auth), bound to active jti
 *
 * Integrity: every stashed token is an independently-signed session JWT. The
 * cookie itself is NOT trusted: every read re-verifies each token through
 * verifySessionTokenDetailed (signature, gen, revocation, session_not_before,
 * exp), and drops entries that fail, are pending, belong to a deleted user,
 * duplicate a user, or exceed the cap. Nothing here ever mints a token.
 *
 * Readers of pf_accounts: ONLY routes under /api/auth (cookie Path). Data
 * routes never consult it (one user per request).
 */

import { NextRequest, NextResponse } from "next/server";
import { decodeJwt } from "jose";
import { verifySessionTokenDetailed, verifyShortLived, revokeJti } from "./jwt";
import { getDEK, deleteDEK } from "@/lib/crypto/dek-cache";
import { getUserById } from "./queries";

export const ACTIVE_COOKIE = "pf_session";
export const STASH_COOKIE = "pf_accounts";
export const ADD_INTENT_COOKIE = "pf_add";
/** Max inactive entries (cap is 5 total including the active one). */
export const MAX_STASH = 4;
export const MAX_ACCOUNTS = MAX_STASH + 1;
/** Hard bound on cookie entries parsed (DoS guard before any verify). */
const MAX_PARSE = 8;
const SESSION_COOKIE_MAX_AGE = 24 * 60 * 60;

export type SessionStatus = "ok" | "expired" | "revoked" | "locked" | "pending";

export interface ResolvedToken {
  userId: string | null;
  jti: string | null;
  dekPresent: boolean;
  status: SessionStatus;
}

/** A verified (token-bearing) bundle member. `token` NEVER leaves this module's callers' server side. */
export interface BundleMember {
  token: string;
  userId: string;
  jti: string;
  dekPresent: boolean;
  /** ok = switchable; locked = valid JWT but DEK evicted (needs password). */
  status: "ok" | "locked";
  exp: number | undefined;
}

export interface AccountInfo {
  userId: string;
  email: string | null;
  displayName: string | null;
  isAdmin: boolean;
  active: boolean;
  status: "ok" | "locked";
}

/**
 * Resolve + validate a session token through the SAME gate as the auth
 * strategy (signature, deploy-gen, jti denylist, session_not_before cutoff).
 *   ok      valid, DEK cached for (jti,userId)
 *   locked  valid, DEK missing (server restart / 2h idle)
 *   pending MFA-pending token (never switchable)
 *   revoked denylist or session_not_before cutoff
 *   expired invalid / expired / deploy-gen mismatch
 */
export async function resolveSessionToken(token: string): Promise<ResolvedToken> {
  const { payload, reason } = await verifySessionTokenDetailed(token);

  if (!payload || !payload.sub) {
    return {
      userId: null,
      jti: null,
      dekPresent: false,
      status: reason === "revoked" ? "revoked" : "expired",
    };
  }
  const jti = (payload.jti as string | undefined) ?? null;
  if (payload.pending) {
    return { userId: payload.sub, jti, dekPresent: false, status: "pending" };
  }
  // A token without a jti can never hold a DEK; treat as locked-only (never switchable).
  const dek = jti ? getDEK(jti, payload.sub) : null;
  return { userId: payload.sub, jti, dekPresent: Boolean(dek), status: dek ? "ok" : "locked" };
}

function tokenExp(token: string): number | undefined {
  try {
    const e = decodeJwt(token).exp;
    return typeof e === "number" ? e : undefined;
  } catch {
    return undefined;
  }
}

/** Decode raw (UNVERIFIED) token strings from the stash cookie. Bounded; malformed -> []. */
function parseStashTokens(cookieValue: string | undefined): string[] {
  if (!cookieValue || cookieValue.length > 16 * 1024) return [];
  try {
    const parsed = JSON.parse(Buffer.from(cookieValue, "base64url").toString("utf-8"));
    if (!Array.isArray(parsed)) return [];
    const out: string[] = [];
    for (const item of parsed.slice(0, MAX_PARSE)) {
      if (item && typeof item === "object" && typeof (item as { t?: unknown }).t === "string") {
        out.push((item as { t: string }).t);
      }
    }
    return out;
  } catch {
    return [];
  }
}

function toMember(token: string, r: ResolvedToken): BundleMember | null {
  if (!r.userId || !r.jti) return null;
  if (r.status !== "ok" && r.status !== "locked") return null;
  return {
    token,
    userId: r.userId,
    jti: r.jti,
    dekPresent: r.dekPresent,
    status: r.status,
    exp: tokenExp(token),
  };
}

export interface LoadedBundle {
  active: BundleMember | null;
  /** Verified, de-duplicated, capped, MRU order. Never contains the active user. */
  stash: BundleMember[];
  /** True when the stash cookie held anything that was dropped (rewrite it). */
  pruned: boolean;
  /** Raw stash tokens that were dropped but are still cryptographically valid sessions (dups/overflow). */
  droppedLive: BundleMember[];
}

/**
 * Verify everything in the cookies. `checkUsers` additionally drops members
 * whose user row no longer exists (deleted account).
 */
export async function loadBundle(
  request: NextRequest,
  opts: { checkUsers?: boolean } = {},
): Promise<LoadedBundle> {
  const activeToken = request.cookies.get(ACTIVE_COOKIE)?.value;
  const rawStash = parseStashTokens(request.cookies.get(STASH_COOKIE)?.value);

  let active: BundleMember | null = null;
  if (activeToken) {
    active = toMember(activeToken, await resolveSessionToken(activeToken));
  }

  const stash: BundleMember[] = [];
  const droppedLive: BundleMember[] = [];
  const seen = new Set<string>();
  if (active) seen.add(active.userId);
  let pruned = false;

  for (const t of rawStash) {
    const m = toMember(t, await resolveSessionToken(t));
    if (!m) {
      pruned = true;
      continue;
    }
    if (opts.checkUsers && !(await getUserById(m.userId).catch(() => null))) {
      pruned = true;
      continue;
    }
    if (seen.has(m.userId) || stash.length >= MAX_STASH) {
      pruned = true;
      droppedLive.push(m);
      continue;
    }
    seen.add(m.userId);
    stash.push(m);
  }
  return { active, stash, pruned, droppedLive };
}

/** Public, token-free account listing (DB-sourced identity). */
export async function listAccounts(request: NextRequest): Promise<{
  accounts: AccountInfo[];
  bundle: LoadedBundle;
}> {
  const bundle = await loadBundle(request, { checkUsers: true });
  const members: Array<[BundleMember, boolean]> = [];
  if (bundle.active) members.push([bundle.active, true]);
  for (const m of bundle.stash) members.push([m, false]);
  const accounts: AccountInfo[] = [];
  for (const [m, isActive] of members) {
    const user = await getUserById(m.userId).catch(() => null);
    accounts.push({
      userId: m.userId,
      email: user?.email ?? null,
      displayName: user?.displayName ?? null,
      isAdmin: user?.role === "admin",
      active: isActive,
      status: m.status,
    });
  }
  return { accounts, bundle };
}

// ─── cookie writers (single place) ──────────────────────────────────────────

function baseOpts() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
  };
}

function writeActive(response: NextResponse, token: string | null): void {
  response.cookies.set(ACTIVE_COOKIE, token ?? "", {
    ...baseOpts(),
    path: "/",
    maxAge: token ? SESSION_COOKIE_MAX_AGE : 0,
  });
}

export function writeStash(response: NextResponse, tokens: string[]): void {
  const common = { ...baseOpts(), path: "/api/auth" };
  if (tokens.length === 0) {
    response.cookies.set(STASH_COOKIE, "", { ...common, maxAge: 0 });
    return;
  }
  const value = Buffer.from(JSON.stringify(tokens.map((t) => ({ t }))), "utf-8").toString("base64url");
  response.cookies.set(STASH_COOKIE, value, { ...common, maxAge: SESSION_COOKIE_MAX_AGE });
}

export function clearAddIntent(response: NextResponse): void {
  response.cookies.set(ADD_INTENT_COOKIE, "", { ...baseOpts(), path: "/api/auth", maxAge: 0 });
}

/** Revoke a member's session server-side: denylist its jti + wipe its DEK. */
export async function revokeMember(m: { jti: string; exp?: number }): Promise<void> {
  const exp = m.exp ? new Date(m.exp * 1000) : new Date(Date.now() + SESSION_COOKIE_MAX_AGE * 1000);
  await revokeJti(m.jti, exp);
  deleteDEK(m.jti);
}

/** Valid `pf_add` intent bound to the CURRENT active session's jti? */
async function hasValidAddIntent(request: NextRequest, active: BundleMember | null): Promise<boolean> {
  const raw = request.cookies.get(ADD_INTENT_COOKIE)?.value;
  if (!raw || !active) return false;
  const payload = await verifyShortLived(raw, "add-account");
  return Boolean(payload && payload.activeJti && payload.activeJti === active.jti);
}

// ─── commit (login / mfa / google / register) ───────────────────────────────

/**
 * Commit a freshly-minted, already-authenticated session as the ACTIVE one.
 * The ONLY writer of pf_session for login-type flows.
 *
 *  - valid pf_add + valid active: old active -> stash (MRU), new -> active.
 *  - otherwise (legacy replace): new -> active, old active dropped (as before
 *    multi-account); other stashed accounts are kept.
 *  - same user already present (active or stash): that entry is REPLACED and
 *    its old jti revoked (never duplicated).
 *  - stash > 4: oldest evicted + revoked.
 *  - pf_add always cleared.
 */
export async function commitSession(
  request: NextRequest,
  response: NextResponse,
  options: { token: string; jti: string; userId: string },
): Promise<void> {
  const { token, jti, userId } = options;
  const bundle = await loadBundle(request);
  const addMode = await hasValidAddIntent(request, bundle.active);

  const toRevoke: BundleMember[] = [...bundle.droppedLive];
  let newStash: BundleMember[] = [];

  for (const m of bundle.stash) {
    if (m.userId === userId) {
      if (m.jti !== jti) toRevoke.push(m);
    } else {
      newStash.push(m);
    }
  }

  const oldActive = bundle.active;
  if (oldActive) {
    if (oldActive.userId === userId) {
      if (oldActive.jti !== jti) toRevoke.push(oldActive);
    } else if (addMode) {
      newStash.unshift(oldActive);
    }
    // legacy replace of a different user's active: dropped, not revoked (pre-existing behaviour)
  }

  if (newStash.length > MAX_STASH) {
    toRevoke.push(...newStash.slice(MAX_STASH));
    newStash = newStash.slice(0, MAX_STASH);
  }

  writeActive(response, token);
  writeStash(response, newStash.map((m) => m.token));
  clearAddIntent(response);

  for (const m of toRevoke) {
    await revokeMember(m).catch(() => {});
  }
}

// ─── switch ─────────────────────────────────────────────────────────────────

export type ActivateResult =
  | { result: "switched"; activeToken: string; stash: string[] }
  | { result: "not_found"; stash: string[] | null }
  | { result: "needs_login"; userId: string; stash: string[] | null };

/**
 * Promote a stashed account to active. Re-verifies the target token (gen,
 * revocation, session_not_before, exp) AND requires its DEK. Never mints.
 * Pure w.r.t. the response: the caller applies `stash` (non-null = rewrite the
 * pruned cookie) via writeStash and, on `switched`, `activeToken` via
 * applySwitch. Tokens are never put in a response body.
 */
export async function activate(request: NextRequest, userId: string): Promise<ActivateResult> {
  const bundle = await loadBundle(request, { checkUsers: true });
  const prunedStash = bundle.pruned ? bundle.stash.map((m) => m.token) : null;
  if (!bundle.active) return { result: "not_found", stash: prunedStash };

  const target = bundle.stash.find((m) => m.userId === userId);
  if (!target) return { result: "not_found", stash: prunedStash };

  if (target.status !== "ok") {
    // DEK evicted: not switchable (re-login via the add flow replaces it).
    return { result: "needs_login", userId, stash: prunedStash };
  }

  const rest = bundle.stash.filter((m) => m.userId !== userId);
  const newStash = [bundle.active, ...rest].slice(0, MAX_STASH);
  return { result: "switched", activeToken: target.token, stash: newStash.map((m) => m.token) };
}

/** Apply a successful activate() to a response (the only pf_session writer for switch). */
export function applySwitch(response: NextResponse, r: Extract<ActivateResult, { result: "switched" }>): void {
  writeActive(response, r.activeToken);
  writeStash(response, r.stash);
}

// ─── logout / removal ───────────────────────────────────────────────────────

export interface LogoutOutcome {
  /** Next active user id after the operation, or null when signed out entirely. */
  activeUserId: string | null;
  /** Every member whose session was revoked. */
  revoked: BundleMember[];
  /** The previously-active member that was signed out (null if none). */
  loggedOut: BundleMember | null;
}

/**
 * Sign out. all=false: revoke ACTIVE only; promote the first still-switchable
 * (ok) stash entry; locked leftovers cannot be used without a password so
 * they are revoked and the bundle clears. all=true: revoke every member and
 * clear both cookies.
 */
export async function logoutBundle(
  request: NextRequest,
  response: NextResponse,
  opts: { all: boolean },
): Promise<LogoutOutcome> {
  const bundle = await loadBundle(request);
  const revoked: BundleMember[] = [];

  if (opts.all) {
    revoked.push(...(bundle.active ? [bundle.active] : []), ...bundle.stash, ...bundle.droppedLive);
    for (const m of revoked) await revokeMember(m);
    writeActive(response, null);
    writeStash(response, []);
    clearAddIntent(response);
    return { activeUserId: null, revoked, loggedOut: bundle.active };
  }

  if (bundle.active) {
    revoked.push(bundle.active);
    await revokeMember(bundle.active);
  }
  const nextIdx = bundle.stash.findIndex((m) => m.status === "ok");
  if (nextIdx === -1) {
    // Nothing switchable left: revoke unusable leftovers, clear everything.
    for (const m of [...bundle.stash, ...bundle.droppedLive]) {
      revoked.push(m);
      await revokeMember(m);
    }
    writeActive(response, null);
    writeStash(response, []);
    clearAddIntent(response);
    return { activeUserId: null, revoked, loggedOut: bundle.active };
  }
  const next = bundle.stash[nextIdx];
  const remaining = bundle.stash.filter((_, i) => i !== nextIdx);
  writeActive(response, next.token);
  writeStash(response, remaining.map((m) => m.token));
  clearAddIntent(response);
  for (const m of bundle.droppedLive) {
    revoked.push(m);
    await revokeMember(m);
  }
  return { activeUserId: next.userId, revoked, loggedOut: bundle.active };
}

/**
 * Drop the ACTIVE account from the browser WITHOUT revoking (its user row is
 * gone — delete-account) and promote the next switchable one, else clear.
 */
export async function dropActiveAndPromote(
  request: NextRequest,
  response: NextResponse,
): Promise<{ activeUserId: string | null }> {
  const bundle = await loadBundle(request, { checkUsers: true });
  const next = bundle.stash.find((m) => m.status === "ok");
  if (!next) {
    writeActive(response, null);
    writeStash(response, []);
    return { activeUserId: null };
  }
  writeActive(response, next.token);
  writeStash(response, bundle.stash.filter((m) => m !== next).map((m) => m.token));
  return { activeUserId: next.userId };
}

// ─── route guard ────────────────────────────────────────────────────────────

/**
 * Session-cookie-only guard for bundle routes: true when the request carries
 * any non-cookie credential (Authorization header, API key header, ?token=).
 * Such requests must not manipulate the browser's cookie bundle.
 */
export function hasNonCookieCredential(request: NextRequest): boolean {
  if (request.headers.get("authorization")) return true;
  if (request.headers.get("x-api-key")) return true;
  try {
    if (request.nextUrl.searchParams.get("token")) return true;
  } catch {
    /* ignore */
  }
  return false;
}
