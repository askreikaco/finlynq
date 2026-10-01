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

import { and, eq, gt, isNull, or } from "drizzle-orm";
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
import { FamilySectionSchema } from "./sections";
import { z } from "zod";

const SectionListSchema = z.array(FamilySectionSchema).min(1);

/** Row filter: the actor is the owner or the viewer of the share. */
function actorOnShare(actorId: string) {
  return or(eq(familyShares.ownerId, actorId), eq(familyShares.viewerId, actorId));
}

/**
 * Create a new share (invite). Sections are validated against the allow-list
 * (FAMILY_SECTIONS_V1); anything else (e.g. "payee") throws.
 */
export async function createShare(
  database: DrizzleDb,
  ownerId: string,
  viewerEmailLower: string,
  sections: string[],
  mustShareBack: boolean = false,
): Promise<string> {
  const valid = Array.from(new Set(SectionListSchema.parse(sections)));
  const [share] = await database
    .insert(familyShares)
    .values({
      ownerId,
      viewerEmailLower,
      sections: valid,
      allSections: false,
      mustShareBack,
      requiredBackSections: mustShareBack ? valid : [],
      status: "pending",
    })
    .returning({ id: familyShares.id });

  return share.id;
}

/** Get a share by ID, only if the actor is its owner or viewer. */
export async function getShareById(
  database: DrizzleDb,
  shareId: string,
  actorId: string,
) {
  const [share] = await database
    .select()
    .from(familyShares)
    .where(and(eq(familyShares.id, shareId), actorOnShare(actorId)))
    .limit(1);

  return share || null;
}

/** All shares owned by this user. */
export async function getOwnerShares(database: DrizzleDb, ownerId: string) {
  return await database
    .select()
    .from(familyShares)
    .where(eq(familyShares.ownerId, ownerId));
}

/** All shares where this user is the viewer. */
export async function getViewerShares(database: DrizzleDb, viewerId: string) {
  return await database
    .select()
    .from(familyShares)
    .where(eq(familyShares.viewerId, viewerId));
}

/**
 * Update share status through the status machine. Throws if the share is not
 * visible to the actor or the transition is illegal.
 */
export async function updateShareStatus(
  database: DrizzleDb,
  shareId: string,
  newStatus: FamilyShareStatus,
  actorId: string,
): Promise<void> {
  const share = await getShareById(database, shareId, actorId);
  if (!share) {
    throw new Error(`Share ${shareId} not found`);
  }

  const currentStatus = share.status as FamilyShareStatus;
  if (!isValidTransition(currentStatus, newStatus)) {
    throw new Error(
      `Invalid transition from ${currentStatus} to ${newStatus}`,
    );
  }

  const updated = await database
    .update(familyShares)
    .set({
      status: newStatus,
      ...(newStatus === "revoked" && { revokedAt: new Date(), revokedBy: actorId }),
      ...(newStatus === "active" && { acceptedAt: new Date() }),
    })
    .where(
      and(
        eq(familyShares.id, shareId),
        eq(familyShares.status, currentStatus),
        actorOnShare(actorId),
      ),
    )
    .returning({ id: familyShares.id });
  if (updated.length === 0) {
    throw new Error(`Share ${shareId} changed concurrently`);
  }
}

/**
 * Revoke a share. Goes through the status guard (terminal states cannot be
 * revoked again), then deletes key grants.
 */
export async function revokeShare(
  database: DrizzleDb,
  shareId: string,
  actorId: string,
): Promise<void> {
  await updateShareStatus(database, shareId, "revoked", actorId);
  await database
    .delete(familyKeyGrants)
    .where(eq(familyKeyGrants.shareId, shareId));
}

/**
 * Accept a share. The share must be pending and addressed to the accepting
 * viewer's verified email; the owner cannot accept their own share.
 */
export async function acceptShare(
  database: DrizzleDb,
  shareId: string,
  viewerId: string,
  viewerEmailLower: string,
): Promise<void> {
  const [share] = await database
    .select()
    .from(familyShares)
    .where(
      and(
        eq(familyShares.id, shareId),
        eq(familyShares.viewerEmailLower, viewerEmailLower),
        eq(familyShares.status, "pending"),
      ),
    )
    .limit(1);
  if (!share || share.ownerId === viewerId) {
    throw new Error(`Share ${shareId} cannot be accepted`);
  }
  if (!isValidTransition("pending", "awaiting_owner_unlock")) {
    throw new Error("Invalid transition from pending to awaiting_owner_unlock");
  }

  const updated = await database
    .update(familyShares)
    .set({
      viewerId,
      status: "awaiting_owner_unlock",
      acceptedAt: new Date(),
    })
    .where(and(eq(familyShares.id, shareId), eq(familyShares.status, "pending")))
    .returning({ id: familyShares.id });
  if (updated.length === 0) {
    throw new Error(`Share ${shareId} changed concurrently`);
  }
}

/**
 * Mark an invite as consumed (single-use). Only an unconsumed, unexpired invite
 * addressed to this email can be consumed. Returns false if nothing matched.
 */
export async function consumeInvite(
  database: DrizzleDb,
  inviteId: string,
  viewerEmailLower: string,
): Promise<boolean> {
  const rows = await database
    .update(familyInvites)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(familyInvites.id, inviteId),
        eq(familyInvites.emailLower, viewerEmailLower),
        isNull(familyInvites.consumedAt),
        gt(familyInvites.expiresAt, new Date()),
      ),
    )
    .returning({ id: familyInvites.id });
  return rows.length > 0;
}

/** Get a user's own keypair (P2 adds generation). */
export async function getUserKeypair(database: DrizzleDb, userId: string) {
  const [keypair] = await database
    .select()
    .from(userKeypairs)
    .where(eq(userKeypairs.userId, userId))
    .limit(1);

  return keypair || null;
}

/** Get an owner's section key by section and epoch. */
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
      and(
        eq(familySectionKeys.ownerId, ownerId),
        eq(familySectionKeys.section, section),
        eq(familySectionKeys.epoch, epoch),
      ),
    )
    .limit(1);

  return key || null;
}

/** All section keys for an owner. */
export async function getOwnerSectionKeys(
  database: DrizzleDb,
  ownerId: string,
) {
  return await database
    .select()
    .from(familySectionKeys)
    .where(eq(familySectionKeys.ownerId, ownerId));
}

/** Key grants for a share, only if the actor is its owner or viewer. */
export async function getShareKeyGrants(
  database: DrizzleDb,
  shareId: string,
  actorId: string,
) {
  const share = await getShareById(database, shareId, actorId);
  if (!share) return [];
  return await database
    .select()
    .from(familyKeyGrants)
    .where(eq(familyKeyGrants.shareId, shareId));
}

/** Labels for one owner + section (sidecar read path). */
export async function getSectionLabels(
  database: DrizzleDb,
  ownerId: string,
  section: string,
) {
  return await database
    .select()
    .from(familyLabels)
    .where(and(eq(familyLabels.ownerId, ownerId), eq(familyLabels.section, section)));
}

/** Bump last_viewed_at; only the viewer of the share may do this. */
export async function updateLastViewed(
  database: DrizzleDb,
  shareId: string,
  viewerId: string,
): Promise<void> {
  await database
    .update(familyShares)
    .set({ lastViewedAt: new Date() })
    .where(and(eq(familyShares.id, shareId), eq(familyShares.viewerId, viewerId)));
}

/**
 * Delete all family data for a user (wipe / delete account).
 * deleteAllUserDataTx performs the same deletes inline; keep them in sync.
 * Cascades handle invites, key grants and reciprocal children.
 */
export async function deleteUserFamilyData(
  database: DrizzleDb,
  userId: string,
): Promise<void> {
  await database
    .delete(familyShares)
    .where(or(eq(familyShares.ownerId, userId), eq(familyShares.viewerId, userId)));
  await database.delete(userKeypairs).where(eq(userKeypairs.userId, userId));
  await database.delete(familySectionKeys).where(eq(familySectionKeys.ownerId, userId));
  await database.delete(familyLabels).where(eq(familyLabels.ownerId, userId));
}
