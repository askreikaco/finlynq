/**
 * THE single definition of "this user has a second factor" (MFA enabled).
 * Used by BOTH the login gate (finish-login.ts issueSessionForDek -> pending
 * token) and the Family overview 2FA gate (family/overview/gate.ts), so the two
 * can never disagree.
 *
 * A user has a second factor when TOTP is enabled (users.mfa_enabled) OR at
 * least one passkey is registered (user_passkeys; every passkey assertion is
 * UV-required, so a passkey is possession + biometric/PIN).
 *
 * A session "passed" the second factor iff its JWT mfa claim is true; that is
 * minted only by the verify routes (TOTP, recovery code, passkey 2FA).
 *
 * DB errors propagate (fail closed): callers must not treat a thrown lookup
 * as "no second factor".
 */
import { db } from "@/db";
import { users } from "@/db/schema-pg";
import { eq } from "drizzle-orm";
import { countPasskeys } from "@/lib/auth/queries";

/**
 * @param knownMfaEnabled the users.mfa_enabled value when the caller already
 *   loaded the row (skips one query); omit to have it read here.
 */
export async function userHasSecondFactor(
  userId: string,
  knownMfaEnabled?: number | boolean | null
): Promise<boolean> {
  let totp = knownMfaEnabled;
  if (totp === undefined) {
    const [u] = await db.select({ mfaEnabled: users.mfaEnabled }).from(users).where(eq(users.id, userId)).limit(1);
    totp = u?.mfaEnabled;
  }
  if (totp) return true;
  return (await countPasskeys(userId)) > 0;
}
