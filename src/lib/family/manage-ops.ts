/**
 * Transactional share-management operations (revoke, update sections).
 *
 * Every operation runs inside withOwnerLock (one DB transaction + per-owner advisory lock), so the
 * status change, grant deletion, epoch rotation and sidecar re-sync commit or roll back together.
 *
 * Rotation rule: a viewer who ever held a SEALED grant knows that section's key K. When that
 * viewer is revoked or a section is dropped, the section is rotated (new K, sidecar re-encrypted,
 * remaining viewers re-sealed) so labels written afterwards are unreadable with the old K.
 * Rotation needs the owner's DEK. Without it (viewer-initiated leave, locked owner session) the
 * viewer's grant rows are KEPT as the rotation marker and the owner's next sweep
 * (syncFamilyLabels -> stale rotation) rotates and deletes them.
 */

import { and, eq, inArray } from "drizzle-orm";
import { db, type DrizzleDb } from "@/db";
import { familyShares, familyKeyGrants } from "@/db/schema-pg";
import { isValidTransition, type FamilyShareStatus } from "./share-status";
import { withOwnerLock, rotateEpoch, keyedSectionsOfShare } from "./grant";
import { syncFamilyLabels } from "./sweep";
import { type FamilySection } from "./sections";

type ShareRow = typeof familyShares.$inferSelect;

async function sealedSections(tx: DrizzleDb, shareId: string): Promise<string[]> {
  const rows = await tx.select().from(familyKeyGrants).where(eq(familyKeyGrants.shareId, shareId));
  return rows.filter((g) => g.status === "ready" && !!g.keySealed).map((g) => g.section);
}

export type RevokeResult =
  | {
      ok: true;
      share: ShareRow;
      actor: "owner" | "viewer";
      rotation: "done" | "deferred" | "not_needed";
      suspendedParentOwnerId: string | null;
    }
  | { ok: false; code: "not_found" | "conflict" };

export async function revokeFamilyShare(opts: {
  shareId: string;
  actorId: string;
  actorDek: Buffer | null;
}): Promise<RevokeResult> {
  const { shareId, actorId, actorDek } = opts;

  const [probe] = await db.select().from(familyShares).where(eq(familyShares.id, shareId)).limit(1);
  if (!probe || (probe.ownerId !== actorId && probe.viewerId !== actorId)) {
    return { ok: false, code: "not_found" };
  }
  const ownerId = probe.ownerId;

  return withOwnerLock(db, ownerId, async (tx) => {
    const [share] = await tx.select().from(familyShares).where(eq(familyShares.id, shareId)).limit(1);
    if (!share || (share.ownerId !== actorId && share.viewerId !== actorId)) {
      return { ok: false, code: "not_found" } as RevokeResult;
    }
    const isOwner = share.ownerId === actorId;
    // key_reset -> revoked is not in the P1 machine, but ending access is always safe.
    if (share.status !== "key_reset" && !isValidTransition(share.status as FamilyShareStatus, "revoked")) {
      return { ok: false, code: "conflict" } as RevokeResult;
    }

    const heldSections = await sealedSections(tx, shareId); // sections whose K the viewer knows

    const [updated] = await tx
      .update(familyShares)
      .set({ status: "revoked", revokedAt: new Date(), revokedBy: actorId })
      .where(and(eq(familyShares.id, shareId), eq(familyShares.status, share.status)))
      .returning();
    if (!updated) return { ok: false, code: "conflict" } as RevokeResult;

    let rotation: "done" | "deferred" | "not_needed" = "not_needed";
    if (heldSections.length > 0) {
      if (isOwner && actorDek) {
        await tx.delete(familyKeyGrants).where(eq(familyKeyGrants.shareId, shareId));
        for (const section of heldSections) {
          await rotateEpoch(tx, ownerId, section, actorDek);
        }
        await syncFamilyLabels(tx, ownerId, actorDek);
        rotation = "done";
      } else {
        // Keep the grant rows as the rotation marker for the owner's next sweep.
        rotation = "deferred";
      }
    } else {
      await tx.delete(familyKeyGrants).where(eq(familyKeyGrants.shareId, shareId));
    }

    // Must-share-back: the reciprocal's owner revoking suspends the parent view (plan §7.4).
    // Parent grants stay as the rotation marker: the parent owner's next sweep rotates them.
    let suspendedParentOwnerId: string | null = null;
    if (isOwner && share.reciprocalOf) {
      const parentRows = await tx
        .update(familyShares)
        .set({ status: "suspended" })
        .where(
          and(
            eq(familyShares.id, share.reciprocalOf),
            eq(familyShares.mustShareBack, true),
            eq(familyShares.viewerId, actorId),
            inArray(familyShares.status, ["active", "awaiting_owner_unlock"]),
          ),
        )
        .returning({ id: familyShares.id, status: familyShares.status, ownerId: familyShares.ownerId });
      // Only live parents are suspended; terminal ones are left alone (status filter above).
      if (parentRows.length > 0) suspendedParentOwnerId = parentRows[0].ownerId;
    }

    return { ok: true, share: updated, actor: isOwner ? "owner" : "viewer", rotation, suspendedParentOwnerId } as RevokeResult;
  });
}

export type UpdateSectionsResult =
  | { ok: true; share: ShareRow }
  | { ok: false; code: "not_found" | "conflict" | "locked" | "required_back"; requiredSections?: string[] };

export async function updateFamilyShareSections(opts: {
  shareId: string;
  ownerId: string;
  sections: FamilySection[];
  ownerDek: Buffer | null;
}): Promise<UpdateSectionsResult> {
  const { shareId, ownerId, ownerDek } = opts;
  const newSections = Array.from(new Set(opts.sections));

  return withOwnerLock(db, ownerId, async (tx) => {
    const [share] = await tx
      .select()
      .from(familyShares)
      .where(and(eq(familyShares.id, shareId), eq(familyShares.ownerId, ownerId)))
      .limit(1);
    if (!share) return { ok: false, code: "not_found" } as UpdateSectionsResult;
    if (!["pending", "awaiting_owner_unlock", "active"].includes(share.status)) {
      return { ok: false, code: "conflict" } as UpdateSectionsResult;
    }

    // Reciprocal of a live must-share-back parent: cannot shrink below the parent's requirement.
    if (share.reciprocalOf) {
      const [parent] = await tx.select().from(familyShares).where(eq(familyShares.id, share.reciprocalOf)).limit(1);
      if (parent && parent.mustShareBack && ["active", "awaiting_owner_unlock"].includes(parent.status)) {
        const required = parent.requiredBackSections ?? [];
        if (!required.every((s) => newSections.includes(s as FamilySection))) {
          return { ok: false, code: "required_back", requiredSections: required } as UpdateSectionsResult;
        }
      }
    }

    const oldKeyed = new Set(keyedSectionsOfShare(share));
    const newKeyed = new Set(keyedSectionsOfShare({ allSections: false, sections: newSections }));
    const dropped = [...oldKeyed].filter((s) => !newKeyed.has(s));
    const added = [...newKeyed].filter((s) => !oldKeyed.has(s));
    const isLive = share.status !== "pending";
    if (isLive && (dropped.length > 0 || added.length > 0) && !ownerDek) {
      return { ok: false, code: "locked" } as UpdateSectionsResult;
    }

    // Narrowing a must-share-back parent relaxes what it requires back (never widens it).
    const required = share.mustShareBack
      ? (share.requiredBackSections ?? []).filter((s) => newSections.includes(s as FamilySection))
      : (share.requiredBackSections ?? []);

    const grantRows = isLive ? await tx.select().from(familyKeyGrants).where(eq(familyKeyGrants.shareId, shareId)) : [];
    const sealed = new Set(grantRows.filter((g) => g.status === "ready" && g.keySealed).map((g) => g.section));

    const [updated] = await tx
      .update(familyShares)
      .set({ sections: newSections, allSections: false, requiredBackSections: required })
      .where(eq(familyShares.id, shareId))
      .returning();

    if (isLive && ownerDek) {
      // Dropped sections the viewer held a key for: rotate (new K) BEFORE re-provisioning.
      for (const section of dropped.filter((s) => sealed.has(s))) {
        await rotateEpoch(tx, ownerId, section, ownerDek);
      }
      // Remaining dropped sections: re-provision removes the viewer's stale grant. New sections: seal.
      // An invitee still awaiting owner unlock is promoted by the sweep: provision everything then.
      const changed = [...dropped, ...added];
      await syncFamilyLabels(
        tx,
        ownerId,
        ownerDek,
        share.status === "awaiting_owner_unlock" || changed.length === 0 ? undefined : { sections: changed },
      );
    }
    return { ok: true, share: updated } as UpdateSectionsResult;
  });
}
