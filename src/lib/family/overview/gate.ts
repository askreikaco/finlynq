/**
 * 2FA gate for the overview. "MFA enabled" is defined exactly as the login flow defines it
 * (src/lib/auth/finish-login.ts issueSessionForDek: `user.mfaEnabled` -> pending token -> TOTP verify
 * issues a session with mfa=true). A registered passkey row is NOT a login second factor in this
 * codebase (password login never asks for it), so it does not satisfy the gate.
 *
 * The gate additionally requires THIS session to have passed the second factor (JWT mfa claim):
 * a session minted before MFA was switched on, or via a path that never asked, is refused until
 * the user signs in again. Recomputed on every request; no caching.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema-pg";

export async function viewerPassesMfaGate(userId: string, sessionMfaVerified: boolean): Promise<boolean> {
  if (!sessionMfaVerified) return false;
  const [u] = await db.select({ mfaEnabled: users.mfaEnabled }).from(users).where(eq(users.id, userId)).limit(1);
  return Boolean(u?.mfaEnabled);
}
