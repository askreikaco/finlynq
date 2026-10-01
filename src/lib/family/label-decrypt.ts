/**
 * Decrypt labels from the family_labels sidecar.
 * Only callable from src/lib/family/overview/* and src/lib/family/* paths.
 *
 * Decryption is gated by the SECTION_LABEL_SOURCES allow-list:
 * only registered (owner, section, entity_type, entity_id) combinations are decryptable.
 * Unregistered columns always return null (generic label fallback).
 */

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { familyLabels } from "@/db/schema-pg";
import { decryptLabel, buildLabelAAD } from "@/lib/crypto/family-crypto";
import { SECTION_LABEL_SOURCES } from "./label-registry";

/**
 * Decrypt a single label from the sidecar, if it exists and is in the allow-list.
 *
 * @param ownerId Owner of the label
 * @param section Section the label belongs to (e.g., "accounts", "goals")
 * @param entityType Type of entity being labeled — must match the table name (e.g., "accounts", "portfolio_holdings")
 * @param entityId ID of the entity (numeric)
 * @param sourceCt The encrypted source (should come from the entity's name_ct or similar) — unused
 * @param sectionKey The section's decryption key (unsealed from the grant)
 *
 * @returns The decrypted label, or null if not found/undecryptable/not in allow-list
 */
export async function decryptLabelIfAllowed(
  ownerId: string,
  section: string,
  entityType: string,
  entityId: number,
  sourceCt: string | null,
  sectionKey: Buffer,
): Promise<string | null> {
  // Check allow-list: is this (section, entityType) combination allowed to be decrypted?
  const source = SECTION_LABEL_SOURCES[section as keyof typeof SECTION_LABEL_SOURCES];
  if (!source || source.table !== entityType) {
    return null;
  }

  // Query the sidecar for this label
  const [row] = await db
    .select()
    .from(familyLabels)
    .where(
      and(
        eq(familyLabels.ownerId, ownerId),
        eq(familyLabels.section, section),
        eq(familyLabels.entityType, entityType),
        eq(familyLabels.entityId, entityId),
      ),
    )
    .limit(1);

  if (!row || !row.labelCt) {
    return null;
  }

  try {
    const aad = buildLabelAAD(ownerId, section, entityType, entityId, row.epoch || 1);
    const label = decryptLabel(sectionKey, row.labelCt, aad);
    return label;
  } catch (err) {
    console.warn(
      `[family] label decrypt failed: owner=${ownerId} section=${section} entity=${entityType}/${entityId}: ${
        err instanceof Error ? err.message : "error"
      }`,
    );
    return null;
  }
}
