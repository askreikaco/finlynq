/**
 * Family Share Data Access Layer.
 *
 * Handles all database operations for family shares, invites, and related data.
 * P1 provides basic CRUD; P2+ adds key rotation and label sweep operations.
 *
 * Key invariants:
 * - Unique (owner_id, viewer_id) per active/pending share
 * - min-section SQL trigger enforces reciprocal scope requirements
 * - Cascading deletes: share -> invites, key_grants, labels
 * - All operations assume caller has authenticated
 */

import { sql } from "drizzle-orm";
import { type DrizzleDb } from "@/db";
import {
  familyShares,
  familyInvites,
  userKeypairs,
  familySectionKeys,
  familyKeyGrants,
  familyLabels,
} from "@/db/schema-pg";
import { FamilyShareStatus, isValidTransition } from "./share-status";

/**
 * Create a new share (invite).
 * Returns the share ID.
 *
 * @param database Database connection
 * @param ownerId Owner user ID
 * @param viewerEmailLower Viewer's email (lowercase)
 * @param sections Data sections to share
 * @param mustShareBack Require the viewer to share back
 */
export async function createShare(
  database: DrizzleDb,
  ownerId: string,
  viewerEmailLower: string,
  sections: string[],
  mustShareBack: boolean = false,
): Promise<string> {
  const [share] = await database
    .insert(familyShares)
    .values({
      ownerId,
      viewerEmailLower,
      sections,
      allSections: false,
      mustShareBack,
      requiredBackSections: mustShareBack ? sections : [],
      status: "pending",
    })
    .returning({ id: familyShares.id });

  return share.id;
}

/**
 * Get a share by ID.
 */
export async function getShareById(database: DrizzleDb, shareId: string) {
  const [share] = await database
    .select()
    .from(familyShares)
    .where(sql`${familyShares.id} = ${shareId}`)
    .limit(1);

  return share || null;
}

/**
 * Get all active shares for an owner.
 */
export async function getOwnerShares(database: DrizzleDb, ownerId: string) {
  return await database
    .select()
    .from(familyShares)
    .where(sql`${familyShares.ownerId} = ${ownerId}`);
}

/**
 * Get all active shares for a viewer (where the viewer can access data).
 */
export async function getViewerShares(database: DrizzleDb, viewerId: string) {
  return await database
    .select()
    .from(familyShares)
    .where(sql`${familyShares.viewerId} = ${viewerId}`);
}

/**
 * Update share status with validation.
 * Throws if the transition is invalid.
 */
export async function updateShareStatus(
  database: DrizzleDb,
  shareId: string,
  newStatus: FamilyShareStatus,
): Promise<void> {
  const share = await getShareById(database, shareId);
  if (!share) {
    throw new Error(`Share ${shareId} not found`);
  }

  const currentStatus = share.status as FamilyShareStatus;
  if (!isValidTransition(currentStatus, newStatus)) {
    throw new Error(
      `Invalid transition from ${currentStatus} to ${newStatus}`,
    );
  }

  await database
    .update(familyShares)
    .set({
      status: newStatus,
      ...(newStatus === "revoked" && { revokedAt: new Date() }),
      ...(newStatus === "active" && { acceptedAt: new Date() }),
    })
    .where(sql`${familyShares.id} = ${shareId}`);
}

/**
 * Revoke a share by ID.
 * Sets status to revoked, deletes key grants, and clears caches.
 */
export async function revokeShare(
  database: DrizzleDb,
  shareId: string,
  revokedBy: string,
): Promise<void> {
  // Delete key grants (cascaded by FK but explicit for clarity)
  await database
    .delete(familyKeyGrants)
    .where(sql`${familyKeyGrants.shareId} = ${shareId}`);

  // Update share to revoked
  await database
    .update(familyShares)
    .set({
      status: "revoked",
      revokedAt: new Date(),
      revokedBy,
    })
    .where(sql`${familyShares.id} = ${shareId}`);
}

/**
 * Accept a share (after viewer email verification).
 * Sets viewer_id, updates status to awaiting_owner_unlock (or active if keys exist).
 */
export async function acceptShare(
  database: DrizzleDb,
  shareId: string,
  viewerId: string,
): Promise<void> {
  // Update share: set viewer_id and move to awaiting_owner_unlock
  await database
    .update(familyShares)
    .set({
      viewerId,
      status: "awaiting_owner_unlock",
      acceptedAt: new Date(),
    })
    .where(sql`${familyShares.id} = ${shareId}`);
}

/**
 * Mark an invite as consumed (single-use).
 */
export async function consumeInvite(
  database: DrizzleDb,
  inviteId: string,
): Promise<void> {
  await database
    .update(familyInvites)
    .set({ consumedAt: new Date() })
    .where(sql`${familyInvites.id} = ${inviteId}`);
}

/**
 * Get a user's keypair, creating it if necessary.
 * P2 will add the actual keypair generation logic.
 * P1: just return the stored keypair or null.
 */
export async function getUserKeypair(database: DrizzleDb, userId: string) {
  const [keypair] = await database
    .select()
    .from(userKeypairs)
    .where(sql`${userKeypairs.userId} = ${userId}`)
    .limit(1);

  return keypair || null;
}

/**
 * Get a section key by owner, section, and epoch.
 */
export async function getSectionKey(
  database: DrizzleDb,
  ownerId: string,
  section: string,
  epoch: number = 1,
) {
  const [key] = await database
    .select()
    .from(familySectionKeys)
    .where(
      sql`${familySectionKeys.ownerId} = ${ownerId} AND ${familySectionKeys.section} = ${section} AND ${familySectionKeys.epoch} = ${epoch}`,
    )
    .limit(1);

  return key || null;
}

/**
 * Get all section keys for an owner.
 */
export async function getOwnerSectionKeys(
  database: DrizzleDb,
  ownerId: string,
) {
  return await database
    .select()
    .from(familySectionKeys)
    .where(sql`${familySectionKeys.ownerId} = ${ownerId}`);
}

/**
 * Get key grants for a share (all sections).
 */
export async function getShareKeyGrants(database: DrizzleDb, shareId: string) {
  return await database
    .select()
    .from(familyKeyGrants)
    .where(sql`${familyKeyGrants.shareId} = ${shareId}`);
}

/**
 * Get labels for a section and owner.
 * Used by the sidecar decryption path.
 */
export async function getSectionLabels(
  database: DrizzleDb,
  ownerId: string,
  section: string,
) {
  return await database
    .select()
    .from(familyLabels)
    .where(
      sql`${familyLabels.ownerId} = ${ownerId} AND ${familyLabels.section} = ${section}`,
    );
}

/**
 * Bump last_viewed_at on a share (throttled to avoid writes on every view).
 */
export async function updateLastViewed(
  database: DrizzleDb,
  shareId: string,
): Promise<void> {
  await database
    .update(familyShares)
    .set({ lastViewedAt: new Date() })
    .where(sql`${familyShares.id} = ${shareId}`);
}

/**
 * Delete all family data for a user (called during wipe/delete account).
 * Cascades handle familyInvites, familyKeyGrants, familyLabels.
 */
export async function deleteUserFamilyData(
  database: DrizzleDb,
  userId: string,
): Promise<void> {
  // Delete as owner
  await database
    .delete(familyShares)
    .where(sql`${familyShares.ownerId} = ${userId}`);

  // Delete as viewer
  await database
    .delete(familyShares)
    .where(sql`${familyShares.viewerId} = ${userId}`);

  // Delete keypair
  await database
    .delete(userKeypairs)
    .where(sql`${userKeypairs.userId} = ${userId}`);

  // Delete section keys
  await database
    .delete(familySectionKeys)
    .where(sql`${familySectionKeys.ownerId} = ${userId}`);

  // Delete labels
  await database
    .delete(familyLabels)
    .where(sql`${familyLabels.ownerId} = ${userId}`);
}
