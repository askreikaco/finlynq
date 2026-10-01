/**
 * Mint a FULL session (mfa claim true: possession + user verification) for a
 * passkey login whose DEK was opened with the credential's PRF wrap.
 *
 * Owns the DEK handling: the session gets ITS OWN Buffer copy (dek-cache
 * zero-fills buffers on eviction; sharing one would zero another holder).
 * The caller keeps/zeroes its own `dek`. All cookies go through commitSession.
 */
import { createSessionToken, SESSION_TTL_MS } from "@/lib/auth/jwt";
import { recordSuccessfulLogin } from "@/lib/auth/queries";
import { putDEK } from "@/lib/crypto/dek-cache";
import { enqueueBackfillSecurities } from "@/lib/securities/backfill";
import { enqueueUpgradeStagingEncryption } from "@/lib/email-import/upgrade-staging-encryption";
import { enqueueProcessPendingInbox } from "@/lib/email-import/process-pending-inbox";
import { enqueueUpgradeUserFieldEncryption } from "@/lib/crypto/upgrade-user-fields";
import { enqueueAutoSyncSimpleFin } from "@/lib/external-import/simplefin-orchestrator";

export async function mintPasskeySession(
  userId: string,
  dek: Buffer
): Promise<{ token: string; jti: string; dek: Buffer }> {
  const sessionDek = Buffer.from(dek);
  await recordSuccessfulLogin(userId);
  const { token, jti } = await createSessionToken(userId, true);
  putDEK(jti, sessionDek, SESSION_TTL_MS, userId);
  enqueueBackfillSecurities(userId, sessionDek);
  enqueueUpgradeStagingEncryption(userId, sessionDek);
  enqueueUpgradeUserFieldEncryption(userId, sessionDek);
  enqueueProcessPendingInbox(userId, sessionDek);
  enqueueAutoSyncSimpleFin(userId, sessionDek);
  return { token, jti, dek: sessionDek };
}
