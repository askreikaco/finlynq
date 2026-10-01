/**
 * Step-up authentication: require additional verification (e.g., currentPassword)
 * for sensitive operations, unless the session is very fresh (< 10 minutes old).
 *
 * Q5: isFreshSession(payload) returns true if iat > now - 10 min. Used by
 * routes that require currentPassword UNLESS the session is very fresh.
 */

/**
 * Check if a session is fresh (issued within the last 10 minutes).
 * Returns true only if iat is present and within 10 minutes.
 * Returns false if iat is missing, NaN, or > 10 minutes old.
 */
export function isFreshSession(iat: number | undefined): boolean {
  if (typeof iat !== "number" || !Number.isFinite(iat)) {
    return false;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const ageSeconds = nowSeconds - iat;
  const tenMinutesSeconds = 10 * 60;

  return ageSeconds < tenMinutesSeconds;
}
