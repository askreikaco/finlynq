/**
 * Session cutoff semantics (users.session_not_before, timestamptz).
 * Reject a token when iat (JWT seconds) <= floor(cutoff in seconds).
 *
 * The replacement session minted by finalizeRecoveryReset gets a NATURAL iat
 * (real now, real exp): finalizeRecoveryReset calls `waitUntilAfterCutoff`
 * so the mint happens in a later wall-clock second than the cutoff. No
 * future/forged timestamps, and tokens minted in the same second as the
 * cutoff stay revoked.
 *
 * Enforcement point: jwt.ts verifySessionTokenDetailed (every session-token
 * consumer funnels through it). Lookup fails CLOSED (DB error -> token
 * treated as invalid).
 */

export function isSessionRevokedByCutoff(iatSeconds: number | undefined, cutoff: Date | null): boolean {
  if (!cutoff) return false;
  if (typeof iatSeconds !== "number" || !Number.isFinite(iatSeconds)) return true;
  return iatSeconds <= Math.floor(cutoff.getTime() / 1000);
}

/**
 * Smallest iat strictly greater than the cutoff second. Pure helper kept for
 * tests/diagnostics; finalizeRecoveryReset does NOT forge it, it waits.
 */
export function replacementIat(cutoff: Date): number {
  return Math.floor(cutoff.getTime() / 1000) + 1;
}

/** Resolve once the wall clock is in a later second than `cutoff` (<= ~1s). */
export async function waitUntilAfterCutoff(cutoff: Date, now: () => number = Date.now): Promise<void> {
  const target = (Math.floor(cutoff.getTime() / 1000) + 1) * 1000;
  const delay = target - now();
  if (delay > 0) await new Promise((r) => setTimeout(r, delay + 5));
}

// ─── Per-user cutoff cache (30s) ───────────────────────────────────────────
export const CUTOFF_CACHE_TTL_MS = 30_000;
const CUTOFF_CACHE_MAX = 5_000;

interface CutoffEntry {
  cutoffMs: number | null;
  expiresAt: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _g = globalThis as any;
if (!_g.__pfSessionCutoffCache) {
  _g.__pfSessionCutoffCache = new Map<string, CutoffEntry>();
}
const cache: Map<string, CutoffEntry> = _g.__pfSessionCutoffCache;

/** Drop the cached cutoff for a user (call after setSessionNotBefore). */
export function bustSessionCutoff(userId: string): void {
  cache.delete(userId);
}

export function _clearSessionCutoffCache(): void {
  cache.clear();
}

/**
 * Cutoff for a user, cached 30s. THROWS on DB error (callers fail closed);
 * failures are never cached.
 */
export async function getSessionCutoffCached(userId: string): Promise<Date | null> {
  const hit = cache.get(userId);
  if (hit && hit.expiresAt > Date.now()) return hit.cutoffMs === null ? null : new Date(hit.cutoffMs);
  if (hit) cache.delete(userId);
  const { getSessionNotBefore } = await import("./queries");
  const cutoff = await getSessionNotBefore(userId);
  if (cache.size >= CUTOFF_CACHE_MAX) {
    const k = cache.keys().next().value;
    if (k !== undefined) cache.delete(k);
  }
  cache.set(userId, { cutoffMs: cutoff ? cutoff.getTime() : null, expiresAt: Date.now() + CUTOFF_CACHE_TTL_MS });
  return cutoff;
}
