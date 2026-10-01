/**
 * Session cutoff semantics (users.session_not_before, timestamptz).
 * Reject a token when iat (JWT seconds) <= floor(cutoff in seconds).
 * B2 RULE: the replacement session minted by finalizeRecoveryReset MUST carry
 * iat = floor(cutoff_s) + 1 (explicit iat), otherwise it is rejected by its own
 * cutoff, while any token minted in the same second as the reset is killed.
 */
export function isSessionRevokedByCutoff(iatSeconds: number | undefined, cutoff: Date | null): boolean {
  if (!cutoff) return false;
  if (typeof iatSeconds !== "number" || !Number.isFinite(iatSeconds)) return true;
  return iatSeconds <= Math.floor(cutoff.getTime() / 1000);
}

/** iat the replacement session must be minted with. */
export function replacementIat(cutoff: Date): number {
  return Math.floor(cutoff.getTime() / 1000) + 1;
}
