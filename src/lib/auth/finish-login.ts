/**
 * Post-authentication login logic extracted from /api/auth/login.
 *
 * This module handles DEK unwrapping, lazy pepper rewrap, and the MFA vs
 * full-session branching after password verification succeeds.
 */

import { SESSION_TTL_MS } from "@/lib/auth/jwt";
import {
  recordSuccessfulLogin,
  promoteUserToEncryption,
} from "@/lib/auth/queries";
import { logApiError } from "@/lib/validate";
import { deriveKEK, unwrapDEK, wrapDEK, createWrappedDEKForPassword } from "@/lib/crypto/envelope";
import { putDEK } from "@/lib/crypto/dek-cache";
import { createSessionToken } from "@/lib/auth/jwt";
import { enqueueBackfillSecurities } from "@/lib/securities/backfill";
import { enqueueUpgradeStagingEncryption } from "@/lib/email-import/upgrade-staging-encryption";
import { enqueueProcessPendingInbox } from "@/lib/email-import/process-pending-inbox";
import { enqueueUpgradeUserFieldEncryption } from "@/lib/crypto/upgrade-user-fields";
import { enqueueAutoSyncSimpleFin } from "@/lib/external-import/simplefin-orchestrator";

/** User row from the database, as returned by getUserByIdentifier. */
interface AuthUser {
  id: string;
  mfaEnabled: number;
  kekSalt?: string | null;
  dekWrapped?: string | null;
  dekWrappedIv?: string | null;
  dekWrappedTag?: string | null;
  pepperVersion?: number | null;
}

/** Result of finishPasswordLogin and issueSessionForDek. */
export type FinishLoginResult =
  | { kind: "mfa"; token: string; jti: string; dek: Buffer | null }
  | { kind: "session"; token: string; jti: string; dek: Buffer | null }
  | { kind: "unlock_failed" };

/**
 * Complete the login flow after password verification succeeds.
 * This handles DEK unwrapping, lazy pepper rewrap, and post-auth promotion.
 * Returns either a pending MFA token or a full session token.
 *
 * @param user - The authenticated user row
 * @param password - The plaintext password (used for DEK derivation)
 * @param _request - Optional NextRequest for logging context (reserved for future use)
 * @returns MFA pending token or full session token with jti
 */
export async function finishPasswordLogin(
  user: AuthUser,
  password: string,
  _request?: unknown
): Promise<FinishLoginResult> {
  // Derive KEK from the plaintext password, unwrap the DEK. Failure here
  // with a matching bcrypt hash would indicate a corrupted DEK envelope
  // (migration bug, not an attack) — treat as fatal and surface to caller.
  let dek: Buffer | null = null;
  if (user.kekSalt && user.dekWrapped && user.dekWrappedIv && user.dekWrappedTag) {
    try {
      // Open #2 — read pepper_version from the user row. Rows with
      // pepper_version=1 use the legacy PF_PEPPER; rows that have been
      // rotated by scripts/rewrap-peppers.ts use PF_PEPPER_V2 (etc).
      // Existing rows without the column (pre-migration) default to 1
      // via the schema-side `.default(1)`.
      const pepperVersion = user.pepperVersion ?? 1;
      const kek = deriveKEK(password, Buffer.from(user.kekSalt, "base64"), pepperVersion);
      dek = unwrapDEK(kek, {
        salt: Buffer.from(user.kekSalt, "base64"),
        wrapped: Buffer.from(user.dekWrapped, "base64"),
        iv: Buffer.from(user.dekWrappedIv, "base64"),
        tag: Buffer.from(user.dekWrappedTag, "base64"),
      });

      // Lazy pepper rewrap (Open #2). When the operator stages a new pepper
      // and sets PF_PEPPER_TARGET_VERSION=N>1, this branch fires for any
      // user still at pepper_version<N and re-wraps their DEK under the
      // target pepper inside this same request. The operator can roll out
      // a pepper rotation without forcing a global force-logout: dormant
      // users stay at the old pepper until they next log in.
      const target = Number(process.env.PF_PEPPER_TARGET_VERSION ?? "1");
      if (Number.isFinite(target) && target > pepperVersion && dek) {
        try {
          const newKek = deriveKEK(
            password,
            Buffer.from(user.kekSalt, "base64"),
            target
          );
          const newWrap = wrapDEK(newKek, dek, Buffer.from(user.kekSalt, "base64"));
          await promoteUserToEncryption(user.id, {
            kekSalt: newWrap.salt.toString("base64"),
            dekWrapped: newWrap.wrapped.toString("base64"),
            dekWrappedIv: newWrap.iv.toString("base64"),
            dekWrappedTag: newWrap.tag.toString("base64"),
          });
          // Bump pepper_version. Done as a separate UPDATE to keep
          // promoteUserToEncryption signature stable (its callers don't
          // know about pepper versions).
          const { db } = await import("@/db");
          const { sql: dz } = await import("drizzle-orm");
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (db as any).execute(
            dz`UPDATE users SET pepper_version = ${target} WHERE id = ${user.id}`
          );
        } catch (err) {
          // Rewrap failure shouldn't block the login. The user gets in
          // with the OLD pepper-wrapped DEK; the next login retries.
          await logApiError("finish-login", "pepper-rewrap", err);
        }
      }
    } catch (err) {
      await logApiError("finish-login", "unwrap", err);
      return { kind: "unlock_failed" };
    }
  } else {
    // Grace migration: pre-encryption account. bcrypt just verified the
    // password, so derive KEK right now, generate a fresh DEK, persist the
    // envelope, and proceed as if the account had always been encrypted.
    // Existing plaintext rows keep working because decryptField passes
    // through values without the `v1:` prefix.
    try {
      const { dek: newDek, wrapped } = createWrappedDEKForPassword(password);
      await promoteUserToEncryption(user.id, {
        kekSalt: wrapped.salt.toString("base64"),
        dekWrapped: wrapped.wrapped.toString("base64"),
        dekWrappedIv: wrapped.iv.toString("base64"),
        dekWrappedTag: wrapped.tag.toString("base64"),
      });
      dek = newDek;
    } catch (err) {
      await logApiError("finish-login", "promote", err);
      // Proceed without DEK — encrypted-column routes will 423. Non-critical.
    }
  }

  return issueSessionForDek(user, dek);
}

/**
 * Issue a session token (or pending MFA token if MFA is enabled).
 * Handles both the MFA branch and the full-session branch.
 *
 * @param user - The authenticated user row
 * @param dek - The unwrapped DEK (may be null if promotion failed)
 * @returns MFA pending token or full session token with jti
 */
export async function issueSessionForDek(
  user: AuthUser,
  dek: Buffer | null
): Promise<FinishLoginResult> {
  // If MFA is enabled, return a pending state (no session yet).
  // B7: the pending token carries `pending: true` and a 5-minute TTL.
  // The default account strategy rejects pending tokens for every route
  // except /api/auth/mfa/verify so a captured pending cookie can't access
  // dashboards or transactions (finding H-4). On successful MFA verify the
  // pending jti is INSERTed into `revoked_jtis` so the token can't be
  // replayed against /mfa/verify either.
  // The DEK is cached under the pending jti with a matching 5-minute TTL so
  // MFA verify can promote it to the real session without asking the user
  // to re-enter their password. If MFA verify fails or times out, the entry
  // ages out naturally.
  if (user.mfaEnabled) {
    const { token: pendingToken, jti: pendingJti } = await createSessionToken(
      user.id,
      false,
      { pending: true, expirationTime: "5m" }
    );
    if (dek) putDEK(pendingJti, dek, 5 * 60_000, user.id);
    return { kind: "mfa", token: pendingToken, jti: pendingJti, dek };
  }

  // No MFA — issue full session and cache the DEK under this session's jti.
  await recordSuccessfulLogin(user.id);
  const { token, jti } = await createSessionToken(user.id, false);
  if (dek) {
    putDEK(jti, dek, SESSION_TTL_MS, user.id);
    // Securities master (Phase C, 2026-06-16): cluster existing positions
    // under `securities` rows + set security_id, using the same canonicalKey
    // partition as the read aggregators. Idempotent, fire-and-forget,
    // DEK-bearing — runs once per user (users.securities_backfilled_at).
    enqueueBackfillSecurities(user.id, dek);
    // Service→user staging-row encryption upgrade (2026-05-06). Flips this
    // user's pending email-staged rows from PF_STAGING_KEY to user-DEK so
    // the 60-day window isn't service-key-decryptable for active users.
    // Idempotent, fire-and-forget, errors swallowed.
    enqueueUpgradeStagingEncryption(user.id, dek);
    // Plaintext-gap closure backstop (2026-06-01): encrypt any remaining
    // plaintext note/payee/tags columns + rule sensitive fields under the
    // user's DEK. Idempotent, fire-and-forget. Fixes legacy/stdio plaintext.
    enqueueUpgradeUserFieldEncryption(user.id, dek);
    // Email-inbox sweep (Epic B5): upgrade service-tier inbox rows, then
    // auto-record any body emails that match a user's email-import rule.
    // Idempotent, fire-and-forget, DEK-bearing.
    enqueueProcessPendingInbox(user.id, dek);
    // SimpleFIN bank-feed auto-sync (~12h throttle): if connected, pull fresh
    // transactions for mapped accounts, each advancing per its own mode.
    // Fire-and-forget, DEK-bearing — covers web + mobile (shared endpoint).
    enqueueAutoSyncSimpleFin(user.id, dek);
  }

  return { kind: "session", token, jti, dek };
}
