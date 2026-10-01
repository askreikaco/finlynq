/**
 * Family Wealth label sidecar sweep (syncFamilyLabels).
 *
 * Maintains family_labels in sync with source entities (accounts, goals, loans,
 * holdings, categories). ONLY the column named in label-registry (name_ct) is ever
 * decrypted; payee/note/tags/alias are unreachable from here.
 *
 * Call sites:
 *   1. Login sweep (enqueueFamilySweep): next to enqueueUpgradeUserFieldEncryption
 *   2. Edit hook (enqueueFamilyLabelSync): after name-writes (account/goal/loan/category/holding)
 *   3. Grant/widen: P3 manage routes call syncFamilyLabels after changing a share
 *   4. Revoke rotation: rotateEpoch (grant.ts) re-sweeps under the new key
 *
 * Idempotency: upsert by PK; skip when src_hash and epoch equal; prune rows whose source is gone.
 * Concurrency: whole sweep runs in one transaction holding pg_advisory_xact_lock(hashtext(owner)).
 */

import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { getAdapter, type DrizzleDb } from "@/db";
import {
  familyLabels,
  familyShares,
  familyKeyGrants,
  familySectionKeys,
  accounts,
  goals,
  loans,
  categories,
  portfolioHoldings,
} from "@/db/schema-pg";
import { SECTION_LABEL_SOURCES } from "./label-registry";
import { type FamilySection, FAMILY_SECTIONS_V1 } from "./sections";
import { encryptLabel, hashLabel, buildLabelAAD, constantTimeEqual } from "@/lib/crypto/family-crypto";
import { decryptField } from "@/lib/crypto/envelope";
import {
  withOwnerLock,
  provisionGrants,
  getLatestSectionKey,
  rotateEpoch,
  LIVE_SHARE_STATUSES,
} from "./grant";

/** Source tables permitted in the sidecar; mirrors label-registry (table -> id/user/name_ct columns). */
const SOURCES = {
  accounts: { table: accounts, id: accounts.id, userId: accounts.userId, nameCt: accounts.nameCt },
  goals: { table: goals, id: goals.id, userId: goals.userId, nameCt: goals.nameCt },
  loans: { table: loans, id: loans.id, userId: loans.userId, nameCt: loans.nameCt },
  categories: { table: categories, id: categories.id, userId: categories.userId, nameCt: categories.nameCt },
  portfolio_holdings: {
    table: portfolioHoldings,
    id: portfolioHoldings.id,
    userId: portfolioHoldings.userId,
    nameCt: portfolioHoldings.nameCt,
  },
} as const;

type SourceTable = keyof typeof SOURCES;

/**
 * Sweep family_labels sidecar for an owner. Returns rows written / pruned.
 *
 * Options:
 *   sections: only sweep/provision these sections (default: all)
 *   entity: only sweep this source table (default: all)
 *   skipStaleRotation: internal (rotateEpoch re-entry guard)
 */
export async function syncFamilyLabels(
  database: DrizzleDb,
  ownerId: string,
  dek: Buffer,
  options?: {
    sections?: FamilySection[];
    entity?: string;
    skipStaleRotation?: boolean;
  },
): Promise<{ written: number; deleted: number }> {
  return withOwnerLock(database, ownerId, async (tx) => {
    let written = 0;
    let deleted = 0;

    // A non-live share (revoked / viewer left / key_reset ...) that still holds grants means its
    // viewer still knows the current key: rotate those sections before anything else.
    if (!options?.skipStaleRotation) {
      const stale = await tx
        .select({ section: familyKeyGrants.section })
        .from(familyKeyGrants)
        .innerJoin(familyShares, eq(familyShares.id, familyKeyGrants.shareId))
        .where(
          and(
            eq(familyShares.ownerId, ownerId),
            sql`${familyShares.status} NOT IN ('active','awaiting_owner_unlock')`,
          ),
        );
      const staleSections = new Set(stale.map((r) => r.section));
      for (const section of staleSections) {
        if (options?.sections && !options.sections.includes(section as FamilySection)) continue;
        await rotateEpoch(tx, ownerId, section, dek);
      }
    }

    const liveSections = await provisionGrants(tx, ownerId, dek, options?.sections);

    for (const section of FAMILY_SECTIONS_V1) {
      if (options?.sections && !options.sections.includes(section)) continue;
      if (!liveSections.has(section)) continue;
      const source = SECTION_LABEL_SOURCES[section];
      if (!source) continue; // e.g. net_worth: no labels
      if (options?.entity && options.entity !== source.table) continue;
      const src = SOURCES[source.table as SourceTable];
      if (!src) continue; // not in allow-list: refuse

      const latest = await getLatestSectionKey(tx, ownerId, section, dek);
      if (!latest) continue;
      try {
        written += await sweepEntity(tx, ownerId, section, source.table as SourceTable, latest.key, latest.epoch, dek);
        deleted += await pruneDeleted(tx, ownerId, section, source.table as SourceTable);
      } finally {
        latest.key.fill(0);
      }
    }

    return { written, deleted };
  });
}

async function sweepEntity(
  tx: DrizzleDb,
  ownerId: string,
  section: FamilySection,
  entityType: SourceTable,
  sectionKey: Buffer,
  epoch: number,
  dek: Buffer,
): Promise<number> {
  const src = SOURCES[entityType];
  const rows = (await tx
    .select({ id: src.id, nameCt: src.nameCt })
    .from(src.table as typeof accounts)
    .where(eq(src.userId, ownerId))) as Array<{ id: number; nameCt: string | null }>;

  const existing = await tx
    .select()
    .from(familyLabels)
    .where(
      and(
        eq(familyLabels.ownerId, ownerId),
        eq(familyLabels.section, section),
        eq(familyLabels.entityType, entityType),
      ),
    );
  const byId = new Map(existing.map((r) => [r.entityId, r]));

  let written = 0;
  for (const row of rows) {
    if (!row.nameCt) continue;

    const srcHash = hashLabel(sectionKey, row.nameCt);
    const prev = byId.get(row.id);
    if (prev && prev.epoch === epoch && prev.srcHash && constantTimeEqual(prev.srcHash, srcHash)) {
      continue; // unchanged
    }

    let name: string | null;
    try {
      name = decryptField(dek, row.nameCt);
    } catch {
      continue; // undecryptable under this DEK: leave sidecar as is (viewer shows generic label)
    }
    if (!name) continue;

    const labelCt = encryptLabel(sectionKey, name, buildLabelAAD(ownerId, section, entityType, row.id, epoch));
    const updatedAt = new Date();
    await tx
      .insert(familyLabels)
      .values({ ownerId, section, entityType, entityId: row.id, epoch, labelCt, srcHash, updatedAt })
      .onConflictDoUpdate({
        target: [familyLabels.ownerId, familyLabels.section, familyLabels.entityType, familyLabels.entityId],
        set: { labelCt, srcHash, epoch, updatedAt },
      });
    written++;
  }
  return written;
}

/** Delete sidecar rows whose source entity no longer exists. Returns rows deleted. */
async function pruneDeleted(
  tx: DrizzleDb,
  ownerId: string,
  section: FamilySection,
  entityType: SourceTable,
): Promise<number> {
  const src = SOURCES[entityType];
  const ids = (
    (await tx.select({ id: src.id }).from(src.table as typeof accounts).where(eq(src.userId, ownerId))) as Array<{
      id: number;
    }>
  ).map((r) => r.id);

  const base = and(
    eq(familyLabels.ownerId, ownerId),
    eq(familyLabels.section, section),
    eq(familyLabels.entityType, entityType),
  );
  const gone = await tx
    .delete(familyLabels)
    .where(ids.length === 0 ? base : and(base, notInArray(familyLabels.entityId, ids)))
    .returning({ entityId: familyLabels.entityId });
  return gone.length;
}

/** True when the owner has live shares or leftover family key material (cheap gate for hooks). */
export async function ownerNeedsFamilySync(database: DrizzleDb, ownerId: string): Promise<boolean> {
  const live = await database
    .select({ id: familyShares.id })
    .from(familyShares)
    .where(and(eq(familyShares.ownerId, ownerId), inArray(familyShares.status, [...LIVE_SHARE_STATUSES])))
    .limit(1);
  if (live.length > 0) return true;
  const keys = await database
    .select({ s: familySectionKeys.section })
    .from(familySectionKeys)
    .where(eq(familySectionKeys.ownerId, ownerId))
    .limit(1);
  return keys.length > 0;
}

/**
 * Fire-and-forget sweep for login / edit paths. Never throws, never awaited by callers,
 * never blocks login or edits; logs only a generic message (no keys, no labels).
 * Runs only when the owner has a live outgoing share or leftover family keys.
 */
export function enqueueFamilySweep(
  ownerId: string,
  dek: Buffer,
  options?: { sections?: FamilySection[]; entity?: string },
): void {
  let dekCopy: Buffer;
  try {
    if (!ownerId || !Buffer.isBuffer(dek) || dek.length !== 32) return;
    // Copy: the caller's DEK buffer may be zeroed/reused after the request ends.
    dekCopy = Buffer.from(dek);
  } catch {
    return; // never throw into login/edit paths
  }
  queueMicrotask(() => {
    void (async () => {
      try {
        // Raw adapter db (not the `db` proxy): a microtask inherits the request's ambient
        // transaction scope, which may already be committed/closed by now.
        const rawDb = getAdapter()?.getDb();
        if (!rawDb) return;
        if (!(await ownerNeedsFamilySync(rawDb, ownerId))) return;
        await syncFamilyLabels(rawDb, ownerId, dekCopy, options);
      } catch (err) {
        console.warn("[family-sweep] failed", {
          err: err instanceof Error ? err.name : "error",
        });
      } finally {
        dekCopy.fill(0);
      }
    })();
  });
}
