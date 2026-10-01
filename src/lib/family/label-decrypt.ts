/**
 * Viewer-side label reads from the family_labels sidecar.
 *
 * Only callable from src/lib/family/** and src/app/api/family/overview/** (eslint guard).
 * The ONLY way a viewer obtains a name: the sidecar row is decrypted with the SECTION key that
 * withSectionKeys() unsealed with the VIEWER's private key. The owner's DEK is never an input,
 * and no entity row (*_ct) is read here.
 *
 * Gated by SECTION_LABEL_SOURCES: only the registered entity type of a section is readable.
 * Any missing / undecryptable label yields no map entry; callers render a generic label.
 */

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { familyLabels } from "@/db/schema-pg";
import { decryptLabel, buildLabelAAD } from "@/lib/crypto/family-crypto";
import { SECTION_LABEL_SOURCES } from "./label-registry";
import type { FamilySection } from "./sections";

/**
 * Decrypt every sidecar label of (owner, section) with the section key.
 * Returns entityId -> label for rows that authenticate under (key, AAD incl. epoch).
 * No key (grant missing / not unsealable) or an unregistered section -> empty map.
 */
export async function loadSectionLabels(
  ownerId: string,
  section: FamilySection,
  sectionKey: Buffer | undefined,
): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  const source = SECTION_LABEL_SOURCES[section];
  if (!source || !sectionKey) return out;

  const rows = await db
    .select()
    .from(familyLabels)
    .where(
      and(
        eq(familyLabels.ownerId, ownerId),
        eq(familyLabels.section, section),
        eq(familyLabels.entityType, source.table),
      ),
    );

  for (const row of rows) {
    if (!row.labelCt) continue;
    try {
      const aad = buildLabelAAD(ownerId, section, source.table, row.entityId, row.epoch);
      out.set(row.entityId, decryptLabel(sectionKey, row.labelCt, aad));
    } catch {
      // wrong key / stale epoch / tampered: generic label (no detail logged)
    }
  }
  return out;
}
