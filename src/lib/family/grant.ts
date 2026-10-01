/**
 * Family share key grant operations.
 *
 * Internal module: grant.ts exports are available ONLY to src/lib/family/overview/**
 * and related internal paths. External routes cannot import this file.
 *
 * Key operations:
 * - withSectionKeys: unseal section keys for a viewer on a share (callback pattern, buffers zeroed)
 * - createUserKeypairIfNeeded: X25519 keypair, private key wrapped by the user's DEK (AAD-bound)
 * - createSectionKey / getAndUnwrapSectionKey: per-owner/section/epoch keys wrapped by owner DEK (AAD-bound)
 * - provisionGrants: ensure section keys exist and are sealed to every LIVE viewer
 * - rotateEpoch: bump epoch, re-seal to active viewers only, re-encrypt sidecar
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import { type DrizzleDb } from "@/db";
import {
  familyShares,
  familyKeyGrants,
  familySectionKeys,
  familyLabels,
  userKeypairs,
} from "@/db/schema-pg";
import {
  unsealKey,
  generateKeypair,
  generateSectionKey,
  sealKey,
  buildGrantAAD,
  buildWrapAAD,
  wrapSecretWithDEK,
  unwrapSecretWithDEK,
  wrapKeyWithDEK,
  unwrapKeyWithDEK,
} from "@/lib/crypto/family-crypto";
import { FAMILY_SECTIONS_V1, type FamilySection } from "./sections";
import { SECTION_LABEL_SOURCES } from "./label-registry";

export { buildGrantAAD };

/** Share statuses whose viewers are entitled to (and receive) key grants. */
export const LIVE_SHARE_STATUSES = ["active", "awaiting_owner_unlock"] as const;

/**
 * Context passed to withSectionKeys callback.
 * Includes unsealed section keys per granted section.
 * Keys are NEVER returned; caller must use them within the callback and they are zeroed after.
 */
export interface SectionKeysContext {
  [section: string]: Buffer; // section -> unsealed key
}

/** Run fn in a transaction holding a per-owner advisory lock (serializes sweeps/rotations per owner). */
export async function withOwnerLock<T>(
  database: DrizzleDb,
  ownerId: string,
  fn: (tx: DrizzleDb) => Promise<T>,
): Promise<T> {
  return (database as unknown as {
    transaction: <R>(cb: (tx: DrizzleDb) => Promise<R>) => Promise<R>;
  }).transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"family-owner:" + ownerId}))`);
    return fn(tx);
  });
}

/** Sections of a share that carry labels (and therefore keys), resolved from all_sections. */
export function keyedSectionsOfShare(share: { allSections: boolean; sections: string[] }): FamilySection[] {
  const resolved = share.allSections
    ? Array.from(FAMILY_SECTIONS_V1)
    : share.sections.filter((s): s is FamilySection => FAMILY_SECTIONS_V1.includes(s as FamilySection));
  return resolved.filter((s) => SECTION_LABEL_SOURCES[s] != null);
}

/**
 * Unseal section keys for a viewer's access to a share (ACTIVE shares only).
 * Callback pattern: keys never returned, only passed to fn; zeroed in finally.
 *
 * @param viewerPrivateKeyHex The viewer's UNWRAPPED X25519 private key (PKCS8 DER hex)
 * @throws If share is not active, not the viewer's, or the viewer has no keypair
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
    const [share] = await database
      .select()
      .from(familyShares)
      .where(eq(familyShares.id, shareId))
      .limit(1);

    if (!share) {
      throw new Error("Share not found");
    }
    if (share.viewerId !== viewerId) {
      throw new Error("Viewer does not match share");
    }
    if (share.status !== "active") {
      throw new Error(`Share is not active (status: ${share.status})`);
    }

    const [keypair] = await database
      .select({ userId: userKeypairs.userId })
      .from(userKeypairs)
      .where(eq(userKeypairs.userId, viewerId))
      .limit(1);
    if (!keypair) {
      throw new Error("Viewer has no keypair yet");
    }

    const grants = await database
      .select()
      .from(familyKeyGrants)
      .where(eq(familyKeyGrants.shareId, shareId));

    const granted = new Set(keyedSectionsOfShare(share));
    for (const grant of grants) {
      if (grant.status !== "ready" || !grant.keySealed) continue;
      // A grant for a section the share no longer covers yields nothing.
      if (!granted.has(grant.section as FamilySection)) continue;

      try {
        const aad = buildGrantAAD(shareId, share.ownerId, viewerId, grant.section, grant.epoch);
        keys[grant.section] = unsealKey(grant.keySealed, viewerPrivateKeyHex, aad);
      } catch (err) {
        // Tampered / wrong epoch / wrong key: caller sees no key -> generic labels.
        console.warn(
          `[family] unseal failed share=${shareId} section=${grant.section}: ${err instanceof Error ? err.message : "error"}`,
        );
      }
    }

    return await fn(keys);
  } finally {
    for (const key of Object.values(keys)) {
      key.fill(0);
    }
  }
}

/**
 * Create a user keypair (X25519) if missing. Private key is wrapped by the user's DEK
 * with AAD bound to the user id. Idempotent.
 */
export async function createUserKeypairIfNeeded(
  database: DrizzleDb,
  userId: string,
  dek: Buffer,
): Promise<{ x25519Pub: string; privWrapped: string }> {
  const [existing] = await database
    .select()
    .from(userKeypairs)
    .where(eq(userKeypairs.userId, userId))
    .limit(1);

  if (existing) {
    return { x25519Pub: existing.x25519Pub, privWrapped: existing.privWrapped };
  }

  const { publicKey, privateKey } = generateKeypair();
  const privBuf = Buffer.from(privateKey, "hex");
  let privWrapped: string;
  try {
    privWrapped = wrapSecretWithDEK(dek, privBuf, buildWrapAAD("priv", userId));
  } finally {
    privBuf.fill(0);
  }

  const [inserted] = await database
    .insert(userKeypairs)
    .values({ userId, x25519Pub: publicKey, privWrapped })
    .onConflictDoNothing()
    .returning({ x25519Pub: userKeypairs.x25519Pub, privWrapped: userKeypairs.privWrapped });

  if (inserted) return inserted;

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

/**
 * Unwrap the user's own X25519 private key (hex). Returns null if absent or undecryptable
 * (e.g. DEK changed). Caller must not log or persist the result.
 */
export async function getUserPrivateKeyHex(
  database: DrizzleDb,
  userId: string,
  dek: Buffer,
): Promise<string | null> {
  const [row] = await database
    .select()
    .from(userKeypairs)
    .where(eq(userKeypairs.userId, userId))
    .limit(1);
  if (!row) return null;
  try {
    const buf = unwrapSecretWithDEK(dek, row.privWrapped, buildWrapAAD("priv", userId));
    const hex = buf.toString("hex");
    buf.fill(0);
    return hex;
  } catch {
    return null;
  }
}

function sectionKeyAAD(ownerId: string, section: string, epoch: number): string {
  return buildWrapAAD("section-key", ownerId, section, epoch);
}

/**
 * Create (or return the already stored) section key for an owner/section/epoch.
 * Stored wrapped by the owner's DEK. Returned buffer is the STORED key; caller must zero it.
 */
export async function createSectionKey(
  database: DrizzleDb,
  ownerId: string,
  section: string,
  dek: Buffer,
  epoch: number = 1,
): Promise<Buffer> {
  const key = generateSectionKey();
  const keyWrapped = wrapKeyWithDEK(dek, key, sectionKeyAAD(ownerId, section, epoch));

  const [inserted] = await database
    .insert(familySectionKeys)
    .values({ ownerId, section, epoch, keyWrapped })
    .onConflictDoNothing()
    .returning({ epoch: familySectionKeys.epoch });

  if (inserted) return key;

  // Lost a race: return the key that actually won, never an unstored one.
  key.fill(0);
  const existing = await getAndUnwrapSectionKey(database, ownerId, section, dek, epoch);
  if (!existing) {
    throw new Error("Failed to create or retrieve section key");
  }
  return existing;
}

/** Retrieve and unwrap an owner's section key. Returns null if absent/undecryptable. */
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
  if (rows.length === 0) return null;
  try {
    return unwrapKeyWithDEK(dek, rows[0].keyWrapped, sectionKeyAAD(ownerId, section, epoch));
  } catch (err) {
    console.error(
      `[family] section key unwrap failed owner=${ownerId} section=${section} epoch=${epoch}: ${err instanceof Error ? err.message : "error"}`,
    );
    return null;
  }
}

/** Latest-epoch section key (unwrapped) with its epoch, or null. Caller zeroes the buffer. */
export async function getLatestSectionKey(
  database: DrizzleDb,
  ownerId: string,
  section: string,
  dek: Buffer,
): Promise<{ key: Buffer; epoch: number } | null> {
  const rows = await database
    .select({ epoch: familySectionKeys.epoch })
    .from(familySectionKeys)
    .where(and(eq(familySectionKeys.ownerId, ownerId), eq(familySectionKeys.section, section)));
  if (rows.length === 0) return null;
  const epoch = Math.max(...rows.map((r) => r.epoch));
  const key = await getAndUnwrapSectionKey(database, ownerId, section, dek, epoch);
  return key ? { key, epoch } : null;
}

/**
 * Seal a section key to a viewer and store the grant (status 'ready').
 * viewerPublicKeyHex MUST be the viewer's key (never the owner's).
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
  if (ownerId === viewerId) {
    throw new Error("Owner cannot be the viewer of a grant");
  }
  const aad = buildGrantAAD(shareId, ownerId, viewerId, section, epoch);
  const keySealed = sealKey(sectionKey, viewerPublicKeyHex, aad);

  await database
    .insert(familyKeyGrants)
    .values({ shareId, section, epoch, keySealed, viewerWrapped: null, status: "ready" })
    .onConflictDoUpdate({
      target: [familyKeyGrants.shareId, familyKeyGrants.section],
      set: { keySealed, viewerWrapped: null, epoch, status: "ready" },
    });
}

/**
 * Ensure, for every LIVE share of the owner, a section key exists for each keyed section
 * and a current-epoch grant is sealed to THAT share's viewer. Also:
 *  - grants for sections a live share no longer covers are deleted
 *  - all grants of non-live shares (revoked/suspended/declined/expired/key_reset/pending) are deleted
 *  - section keys + sidecar rows of sections no live share covers are deleted
 * Viewers without a keypair get an 'awaiting_keys' placeholder (no key material).
 * Must run inside withOwnerLock. Returns the set of sections still live.
 */
export async function provisionGrants(
  database: DrizzleDb,
  ownerId: string,
  dek: Buffer,
  onlySections?: FamilySection[],
): Promise<Set<FamilySection>> {
  const shares = await database.select().from(familyShares).where(eq(familyShares.ownerId, ownerId));
  const liveShares = shares.filter((s) =>
    (LIVE_SHARE_STATUSES as readonly string[]).includes(s.status),
  );
  const deadShareIds = shares.filter((s) => !liveShares.includes(s)).map((s) => s.id);
  const inScope = (sec: string) => !onlySections || onlySections.includes(sec as FamilySection);

  // Grants of non-live shares never survive.
  if (deadShareIds.length > 0) {
    await database.delete(familyKeyGrants).where(inArray(familyKeyGrants.shareId, deadShareIds));
  }

  const liveSections = new Set<FamilySection>();
  const keypairs = new Map<string, string>();
  const viewerIds = liveShares.map((s) => s.viewerId).filter((v): v is string => !!v);
  if (viewerIds.length > 0) {
    const kps = await database
      .select({ userId: userKeypairs.userId, pub: userKeypairs.x25519Pub })
      .from(userKeypairs)
      .where(inArray(userKeypairs.userId, viewerIds));
    for (const kp of kps) keypairs.set(kp.userId, kp.pub);
  }

  const latest = new Map<string, { key: Buffer; epoch: number }>();
  try {
    for (const share of liveShares) {
      const covered = keyedSectionsOfShare(share);
      covered.forEach((s) => liveSections.add(s));

      const existingGrants = await database
        .select()
        .from(familyKeyGrants)
        .where(eq(familyKeyGrants.shareId, share.id));
      const stale = existingGrants
        .filter((g) => !covered.includes(g.section as FamilySection) && inScope(g.section))
        .map((g) => g.section);
      if (stale.length > 0) {
        await database
          .delete(familyKeyGrants)
          .where(and(eq(familyKeyGrants.shareId, share.id), inArray(familyKeyGrants.section, stale)));
      }

      for (const section of covered) {
        if (!inScope(section)) continue;

        let cur = latest.get(section) ?? null;
        if (!cur) {
          cur = await getLatestSectionKey(database, ownerId, section, dek);
          if (!cur) {
            cur = { key: await createSectionKey(database, ownerId, section, dek, 1), epoch: 1 };
          }
          latest.set(section, cur);
        }

        if (!share.viewerId || share.viewerId === ownerId) continue;
        // Only ACTIVE viewers receive sealed keys; awaiting_owner_unlock gets a placeholder.
        const pub = share.status === "active" ? keypairs.get(share.viewerId) : undefined;
        if (!pub) {
          await database
            .insert(familyKeyGrants)
            .values({ shareId: share.id, section, epoch: cur.epoch, keySealed: null, status: "awaiting_keys" })
            .onConflictDoUpdate({
              target: [familyKeyGrants.shareId, familyKeyGrants.section],
              set: { epoch: cur.epoch, keySealed: null, viewerWrapped: null, status: "awaiting_keys" },
            });
          continue;
        }

        const existing = existingGrants.find((g) => g.section === section);
        if (existing && existing.status === "ready" && existing.keySealed && existing.epoch === cur.epoch) {
          continue;
        }
        await sealAndStoreGrant(database, share.id, section, cur.epoch, cur.key, pub, ownerId, share.viewerId);
      }
    }
  } finally {
    for (const v of latest.values()) v.key.fill(0);
  }

  // Sections nobody live covers: drop key + sidecar (nothing left to protect or serve).
  const orphanSections = FAMILY_SECTIONS_V1.filter((s) => !liveSections.has(s) && inScope(s));
  if (orphanSections.length > 0) {
    await database
      .delete(familySectionKeys)
      .where(and(eq(familySectionKeys.ownerId, ownerId), inArray(familySectionKeys.section, orphanSections)));
    await database
      .delete(familyLabels)
      .where(and(eq(familyLabels.ownerId, ownerId), inArray(familyLabels.section, orphanSections)));
  }

  return liveSections;
}

/**
 * Bump the epoch for a section: new random key, old epochs dropped, sidecar re-encrypted
 * under the new key, grants re-sealed to ACTIVE viewers only (grants of revoked/suspended/
 * declined/expired/key_reset shares are deleted). Returns the new epoch.
 * The `_shareId` argument is accepted for backward compatibility and ignored: rotation always
 * covers every share of the owner for the section.
 */
export async function rotateEpoch(
  database: DrizzleDb,
  ownerId: string,
  section: string,
  dek: Buffer,
  _shareId?: string,
): Promise<number> {
  if (!FAMILY_SECTIONS_V1.includes(section as FamilySection)) {
    throw new Error("Unknown section");
  }
  return withOwnerLock(database, ownerId, async (tx) => {
    const rows = await tx
      .select({ epoch: familySectionKeys.epoch })
      .from(familySectionKeys)
      .where(and(eq(familySectionKeys.ownerId, ownerId), eq(familySectionKeys.section, section)));
    const newEpoch = Math.max(...rows.map((r) => r.epoch), 0) + 1;

    const newKey = await createSectionKey(tx, ownerId, section, dek, newEpoch);
    newKey.fill(0);

    // Old epoch keys are no longer needed by the owner; sidecar is rebuilt under the new key.
    await tx
      .delete(familySectionKeys)
      .where(
        and(
          eq(familySectionKeys.ownerId, ownerId),
          eq(familySectionKeys.section, section),
          sql`${familySectionKeys.epoch} <> ${newEpoch}`,
        ),
      );
    await tx
      .delete(familyLabels)
      .where(and(eq(familyLabels.ownerId, ownerId), eq(familyLabels.section, section)));

    // Re-seal to live viewers (drops non-live grants), then rebuild sidecar from source.
    const { syncFamilyLabels } = await import("./sweep");
    await syncFamilyLabels(tx, ownerId, dek, { sections: [section as FamilySection], skipStaleRotation: true });
    return newEpoch;
  });
}
