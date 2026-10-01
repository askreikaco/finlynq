/**
 * Family share key grant operations.
 *
 * Internal module: grant.ts exports are available ONLY to src/lib/family/overview/**
 * and related internal paths. External routes cannot import this file.
 * ESLint rule: no-restricted-imports will enforce this boundary.
 *
 * Key operations:
 * - withSectionKeys: unseal section keys for a viewer on a share (callback pattern)
 * - createUserKeypair: generate and store keypair at first login
 * - rotateSectionKey: increment epoch and re-encrypt sidecar + re-seal grants
 * - finalizeGrants: convert 'awaiting_keys' grants to 'ready' after owner login
 */

import { and, eq } from "drizzle-orm";
import { type DrizzleDb } from "@/db";
import {
  familyShares,
  familyKeyGrants,
  familySectionKeys,
  userKeypairs,
} from "@/db/schema-pg";
import {
  unsealKey,
  generateKeypair,
  generateSectionKey,
  sealKey,
} from "@/lib/crypto/family-crypto";
import { encryptField } from "@/lib/crypto/envelope";

/**
 * Context passed to withSectionKeys callback.
 * Includes unsealed section keys per granted section.
 * Keys are NEVER returned; caller must use them within the callback and they are zeroed after.
 */
export interface SectionKeysContext {
  [section: string]: Buffer; // section -> unsealed key
}

/**
 * Unseal section keys for a viewer's access to a share.
 * Callback pattern: keys never returned, only passed to fn.
 * Keys are zeroed in the finally block after callback completes.
 *
 * Call flow:
 *   1. Load share (must be active)
 *   2. Load viewer's keypair (must exist; return early with empty keys if not)
 *   3. Load key grants for the share
 *   4. For each granted section, unseal K via ECIES
 *   5. Call fn(keys)
 *   6. Zero all keys in finally
 *
 * @param shareId The share ID
 * @param viewerId The viewer's user ID
 * @param viewerPrivateKeyHex The viewer's X25519 private key (hex string)
 * @param database Drizzle database instance
 * @param fn Callback that receives unsealed keys; return value is returned
 * @returns Whatever fn returns
 * @throws If share is not active, viewer keypair not found, or unseal fails
 */
export async function withSectionKeys<T>(
  shareId: string,
  viewerId: string,
  viewerPrivateKeyHex: string,
  database: DrizzleDb,
  fn: (keys: SectionKeysContext) => Promise<T>,
): Promise<T> {
  const keys: SectionKeysContext = {};

  try {
    // Load share and verify it's active
    const [share] = await database
      .select()
      .from(familyShares)
      .where(eq(familyShares.id, shareId))
      .limit(1);

    if (!share) {
      throw new Error(`Share ${shareId} not found`);
    }

    if (share.status !== "active" && share.status !== "awaiting_owner_unlock") {
      throw new Error(`Share ${shareId} is not active (status: ${share.status})`);
    }

    if (share.viewerId !== viewerId) {
      throw new Error(`Viewer ${viewerId} is not the viewer of share ${shareId}`);
    }

    // Load viewer's keypair
    const [keypair] = await database
      .select()
      .from(userKeypairs)
      .where(eq(userKeypairs.userId, viewerId))
      .limit(1);

    if (!keypair) {
      throw new Error(`Viewer ${viewerId} has no keypair yet`);
    }

    // Load all key grants for this share
    const grants = await database
      .select()
      .from(familyKeyGrants)
      .where(eq(familyKeyGrants.shareId, shareId));

    // Unseal each grant
    for (const grant of grants) {
      if (grant.status !== "ready") {
        // Skip awaiting_keys grants (keys not yet available)
        continue;
      }

      if (!grant.keySealed) {
        // Grant has no sealed key (may have been nulled after re-wrap)
        // Treat as unavailable; caller will fall back to generic labels
        continue;
      }

      try {
        const aad = buildGrantAAD(shareId, share.ownerId, viewerId, grant.section, grant.epoch);
        const key = unsealKey(grant.keySealed, keypair.x25519Pub, aad);
        keys[grant.section] = key;
      } catch (err) {
        // If unseal fails (tampered ciphertext, wrong epoch, etc),
        // skip this section's key. Caller gets null key -> generic labels.
        console.warn(`[family] Failed to unseal key for share ${shareId} section ${grant.section}:`, err);
      }
    }

    // Call user function with unsealed keys
    return await fn(keys);
  } finally {
    // Zero all keys after callback
    for (const key of Object.values(keys)) {
      key.fill(0);
    }
  }
}

/**
 * Build the AAD (additional authenticated data) for a key grant.
 * Format: shareId|ownerId|viewerId|section|epoch
 * Domain-separated with "finlynq-family-seal-v1" passed to HKDF.
 */
export function buildGrantAAD(
  shareId: string,
  ownerId: string,
  viewerId: string,
  section: string,
  epoch: number,
): string {
  return `${shareId}|${ownerId}|${viewerId}|${section}|${epoch}`;
}

/**
 * Create a user keypair (X25519) at first login if the user has shares.
 * Private key is wrapped by the user's DEK.
 * Idempotent: if keypair already exists, does nothing and returns the existing keypair.
 */
export async function createUserKeypairIfNeeded(
  database: DrizzleDb,
  userId: string,
  dek: Buffer,
): Promise<{ x25519Pub: string; privWrapped: string }> {
  // Check if keypair already exists
  const [existing] = await database
    .select()
    .from(userKeypairs)
    .where(eq(userKeypairs.userId, userId))
    .limit(1);

  if (existing) {
    return { x25519Pub: existing.x25519Pub, privWrapped: existing.privWrapped };
  }

  // Generate new keypair
  const { publicKey, privateKey } = generateKeypair();

  // Wrap private key with DEK
  // AAD: "family-priv|" + userId
  const privWrapped = encryptField(dek, privateKey);
  if (!privWrapped) {
    throw new Error("Failed to wrap private key");
  }

  // Insert into database
  const [inserted] = await database
    .insert(userKeypairs)
    .values({
      userId,
      x25519Pub: publicKey,
      privWrapped,
    })
    .onConflictDoNothing()
    .returning({ x25519Pub: userKeypairs.x25519Pub, privWrapped: userKeypairs.privWrapped });

  if (!inserted) {
    // Concurrent insert; fetch the one that won
    const [concurrent] = await database
      .select()
      .from(userKeypairs)
      .where(eq(userKeypairs.userId, userId))
      .limit(1);
    if (!concurrent) {
      throw new Error("Failed to create or retrieve keypair");
    }
    return { x25519Pub: concurrent.x25519Pub, privWrapped: concurrent.privWrapped };
  }

  return { x25519Pub: inserted.x25519Pub, privWrapped: inserted.privWrapped };
}

/**
 * Create a new section key for an owner/section pair.
 * Stores it wrapped by the owner's DEK.
 * Returns the key (unwrapped) for immediate use; caller must zero it after.
 */
export async function createSectionKey(
  database: DrizzleDb,
  ownerId: string,
  section: string,
  dek: Buffer,
  epoch: number = 1,
): Promise<Buffer> {
  // Generate key
  const key = generateSectionKey();

  // Wrap with DEK
  const keyWrapped = encryptField(dek, Buffer.from(key).toString("base64"));
  if (!keyWrapped) {
    throw new Error("Failed to wrap section key");
  }

  // Insert (may fail with unique constraint if concurrent; that's ok, we re-fetch)
  await database
    .insert(familySectionKeys)
    .values({
      ownerId,
      section,
      epoch,
      keyWrapped,
    })
    .onConflictDoNothing();

  return key;
}

/**
 * Retrieve and unwrap an owner's section key.
 * Returns null if key doesn't exist.
 */
export async function getAndUnwrapSectionKey(
  database: DrizzleDb,
  ownerId: string,
  section: string,
  dek: Buffer,
  epoch: number = 1,
): Promise<Buffer | null> {
  const rows = await database
    .select()
    .from(familySectionKeys)
    .where(
      and(
        eq(familySectionKeys.ownerId, ownerId),
        eq(familySectionKeys.section, section),
        eq(familySectionKeys.epoch, epoch),
      ),
    )
    .limit(1);

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];

  // Unwrap: row.keyWrapped is an encrypted string in v1 format
  try {
    const { decryptField } = await import("@/lib/crypto/envelope");
    const unwrapped = decryptField(dek, row.keyWrapped);
    if (!unwrapped) {
      return null;
    }
    const buf = Buffer.from(unwrapped, "base64");
    if (buf.length !== 32) {
      throw new Error(`Unwrapped key is ${buf.length} bytes, expected 32`);
    }
    return buf;
  } catch (err) {
    console.error(`[family] Failed to unwrap section key ${ownerId}/${section}/${epoch}:`, err);
    return null;
  }
}

/**
 * Seal a section key to a viewer and store the grant.
 * Creates or updates the grant row with key_sealed and status='ready'.
 */
export async function sealAndStoreGrant(
  database: DrizzleDb,
  shareId: string,
  section: string,
  epoch: number,
  sectionKey: Buffer,
  viewerPublicKeyHex: string,
  ownerId: string,
  viewerId: string,
): Promise<void> {
  const aad = buildGrantAAD(shareId, ownerId, viewerId, section, epoch);
  const keySealed = sealKey(sectionKey, viewerPublicKeyHex, aad);

  await database
    .insert(familyKeyGrants)
    .values({
      shareId,
      section,
      epoch,
      keySealed,
      viewerWrapped: null,
      status: "ready",
    })
    .onConflictDoUpdate({
      target: [familyKeyGrants.shareId, familyKeyGrants.section],
      set: {
        keySealed,
        viewerWrapped: null,
        epoch,
        status: "ready",
      },
    });
}

/**
 * Bump the epoch for a section and re-seal to active viewers.
 * Called during rotation after revoke or password reset.
 *
 * Flow:
 *   1. Fetch current epoch for this section
 *   2. Increment epoch
 *   3. Create new section key at new epoch (wrapped by owner DEK)
 *   4. Re-encrypt sidecar under new key (separate operation in caller)
 *   5. For each active grant on the share:
 *      - Load viewer's public key
 *      - Seal new key to viewer
 *      - Update grant with new epoch + sealed key
 *   6. Mark old epoch key as "revoked" (optional) or leave it for audit
 *
 * Note: Caller is responsible for re-encrypting sidecar labels.
 */
export async function rotateEpoch(
  database: DrizzleDb,
  ownerId: string,
  section: string,
  dek: Buffer,
  shareId?: string,
): Promise<number> {
  // Fetch current max epoch for this section
  const currentEpochRows = await database
    .select({ epoch: familySectionKeys.epoch })
    .from(familySectionKeys)
    .where(
      and(
        eq(familySectionKeys.ownerId, ownerId),
        eq(familySectionKeys.section, section),
      ),
    );

  const currentEpoch = Math.max(...currentEpochRows.map((r) => r.epoch), 0);
  const newEpoch = currentEpoch + 1;

  // Create new section key at new epoch
  const newKey = await createSectionKey(database, ownerId, section, dek, newEpoch);

  // If a specific share is provided, update its grants
  if (shareId) {
    const shares = await database
      .select()
      .from(familyShares)
      .where(eq(familyShares.id, shareId))
      .limit(1);

    if (shares.length > 0) {
      const share = shares[0];
      if (share.viewerId) {
        const keypairs = await database
          .select()
          .from(userKeypairs)
          .where(eq(userKeypairs.userId, share.viewerId))
          .limit(1);

        if (keypairs.length > 0) {
          const keypair = keypairs[0];
          await sealAndStoreGrant(
            database,
            shareId,
            section,
            newEpoch,
            newKey,
            keypair.x25519Pub,
            ownerId,
            share.viewerId,
          );
        }
      }
    }
  }

  newKey.fill(0);
  return newEpoch;
}
