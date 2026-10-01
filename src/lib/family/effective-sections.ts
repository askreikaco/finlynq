/**
 * Effective sections of a share, with must-share-back re-consent (plan 7.4).
 *
 * A must-share-back parent (A -> B) requires the reciprocal child (B -> A) to cover
 * required_back_sections. When A widens the parent, updateFamilyShareSections raises the
 * requirement to the widened set; until B widens the child to cover it ("re-consent"), B only
 * receives the part of the parent that B reciprocates:
 *
 *   reconsent pending  <=>  required_back not subset of child sections
 *   effective          =  pending ? parent.sections INTERSECT child.sections : parent.sections
 *
 * No live child for a must-share-back parent fails CLOSED (nothing effective). Used by the key
 * provisioning (grant.ts), the key unseal (withSectionKeys) and the overview, so a section that
 * B has not reciprocated is neither keyed nor served.
 */
import { and, inArray } from "drizzle-orm";
import type { DrizzleDb } from "@/db";
import { familyShares } from "@/db/schema-pg";
import { resolveSections, type FamilySection } from "./sections";

type ShareLike = {
  id: string;
  allSections: boolean;
  sections: string[];
  mustShareBack: boolean;
  requiredBackSections: string[] | null;
};
type ChildLike = { allSections: boolean; sections: string[] } | null | undefined;

const CHILD_LIVE: Array<"active" | "awaiting_owner_unlock"> = ["active", "awaiting_owner_unlock"];

export function effectiveSectionsOf(share: ShareLike, child: ChildLike): FamilySection[] {
  const all = resolveSections(share.allSections, share.sections);
  if (!share.mustShareBack) return all;
  if (!child) return [];
  const back = new Set<string>(resolveSections(child.allSections, child.sections));
  const required = share.requiredBackSections ?? [];
  if (required.every((s) => back.has(s))) return all;
  return all.filter((s) => back.has(s));
}

/** Sections the parent requires back that the child does not yet cover (empty = consented). */
export function reconsentMissing(share: ShareLike, child: ChildLike): FamilySection[] {
  if (!share.mustShareBack) return [];
  const back = new Set<string>(child ? resolveSections(child.allSections, child.sections) : []);
  return (share.requiredBackSections ?? []).filter((s) => !back.has(s)) as FamilySection[];
}

/** Live reciprocal children (viewer -> owner) of the given parent shares, keyed by parent id. */
export async function loadLiveChildren(
  database: DrizzleDb,
  parentIds: string[],
): Promise<Map<string, { allSections: boolean; sections: string[] }>> {
  const out = new Map<string, { allSections: boolean; sections: string[] }>();
  if (parentIds.length === 0) return out;
  const rows = await database
    .select({
      reciprocalOf: familyShares.reciprocalOf,
      allSections: familyShares.allSections,
      sections: familyShares.sections,
    })
    .from(familyShares)
    .where(and(inArray(familyShares.reciprocalOf, parentIds), inArray(familyShares.status, CHILD_LIVE)));
  for (const r of rows) if (r.reciprocalOf) out.set(r.reciprocalOf, { allSections: r.allSections, sections: r.sections });
  return out;
}
