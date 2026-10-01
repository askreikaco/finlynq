/**
 * 2FA gate for the overview. "MFA enabled" is defined in ONE place,
 * src/lib/auth/second-factor.ts userHasSecondFactor, which is also what the login flow
 * (finish-login.ts issueSessionForDek -> pending token -> second-factor verify issues a session
 * with mfa=true) uses: TOTP enabled OR a registered passkey. The two can never disagree.
 *
 * The gate additionally requires THIS session to have passed the second factor (JWT mfa claim,
 * minted by the TOTP / recovery-code / passkey verify routes only): a session minted before MFA
 * was switched on (or a passkey added), or via a path that never asked, is refused until the user
 * signs in again. Recomputed on every request; no caching.
 */
import { userHasSecondFactor } from "@/lib/auth/second-factor";

export async function viewerPassesMfaGate(userId: string, sessionMfaVerified: boolean): Promise<boolean> {
  if (!sessionMfaVerified) return false;
  return userHasSecondFactor(userId);
}
