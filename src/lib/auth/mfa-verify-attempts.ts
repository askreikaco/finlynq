const ATTEMPTS_MAX_ENTRIES = 5000;

interface AttemptEntry {
  count: number;
  /** Best-effort eviction hint; we drop entries on first miss after expiry. */
  expiresAt: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _g = globalThis as any;
if (!_g.__pfMfaVerifyAttempts) {
  _g.__pfMfaVerifyAttempts = new Map<string, AttemptEntry>();
}
const attemptCounter: Map<string, AttemptEntry> = _g.__pfMfaVerifyAttempts;

export function recordVerifyAttempt(jti: string, expSeconds: number): number {
  if (attemptCounter.size >= ATTEMPTS_MAX_ENTRIES) {
    const now = Date.now();
    for (const [k, v] of attemptCounter) {
      if (v.expiresAt <= now) attemptCounter.delete(k);
    }
    if (attemptCounter.size >= ATTEMPTS_MAX_ENTRIES) {
      const firstKey = attemptCounter.keys().next().value;
      if (firstKey !== undefined) attemptCounter.delete(firstKey);
    }
  }
  const entry = attemptCounter.get(jti);
  if (entry) {
    entry.count++;
    return entry.count;
  }
  attemptCounter.set(jti, {
    count: 1,
    expiresAt: expSeconds > 0 ? expSeconds * 1000 : Date.now() + 5 * 60_000,
  });
  return 1;
}

export function clearVerifyAttempt(jti: string): void {
  attemptCounter.delete(jti);
}

/** Test helper. Resets the per-jti counter. */
export function _clearVerifyAttempts(): void {
  attemptCounter.clear();
}
