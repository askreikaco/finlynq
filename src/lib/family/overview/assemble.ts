/**
 * assembleFamilyOverview: builds the per-member DTOs of GET /api/family/overview.
 *
 * Key handling (plan 2/6): for a shared member the viewer's session DEK unwraps the viewer's
 * private key, withSectionKeys() unseals the per-section keys the share grants, the sidecar labels
 * of exactly those sections are decrypted in memory, and the keys are zeroed when the callback
 * returns. The owner's DEK is never an input and never reachable here. Section builders run with
 * plain label maps only and are invoked solely for sections the share grants.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { familyShares } from "@/db/schema-pg";
import { getUserById } from "@/lib/auth/queries";
import { getUserPrivateKeyHex, withSectionKeys } from "../grant";
import { loadSectionLabels } from "../label-decrypt";
import { SECTION_LABEL_SOURCES } from "../label-registry";
import { FAMILY_SECTIONS_V1, type FamilySection } from "../sections";
import { effectiveSectionsOf, loadLiveChildren } from "../effective-sections";
import type { NetWorthPeriod } from "../read-queries";
import { SECTION_BUILDERS, type MemberCtx } from "./builders";
import { loadOwnSectionLabels } from "./own-labels";
import type { FxContext } from "./fx";
import type { MemberDto, PartialReason } from "./dto";

export interface OverviewShare {
  id: string;
  ownerId: string;
  allSections: boolean;
  sections: string[];
  mustShareBack: boolean;
  requiredBackSections: string[] | null;
}

export interface AssembleInput {
  viewerId: string;
  /** The VIEWER's session DEK (null when the server restarted: numbers still served, labels generic). */
  viewerDek: Buffer | null;
  shares: OverviewShare[];
  fx: FxContext;
  period: NetWorthPeriod;
  today: string;
}

async function buildMember(
  base: { id: string; relation: "me" | "shared"; name: string; ownerId: string },
  granted: FamilySection[],
  labels: Map<FamilySection, Map<number, string>>,
  input: AssembleInput,
): Promise<MemberDto> {
  const ctx: MemberCtx = {
    ownerId: base.ownerId,
    fx: input.fx,
    today: input.today,
    period: input.period,
    labels,
    partial: new Set<PartialReason>(),
    generic: { used: false },
    memo: {},
  };
  const sections: Record<string, unknown> = {};
  const unavailable: FamilySection[] = [];
  for (const section of FAMILY_SECTIONS_V1) {
    if (!granted.includes(section)) continue;
    try {
      sections[section] = await SECTION_BUILDERS[section](ctx);
    } catch (err) {
      // generic message only: never log values
      console.error(`[family] section build failed: ${section}: ${err instanceof Error ? err.name : "error"}`);
      unavailable.push(section);
      ctx.partial.add("section_error");
    }
  }
  return {
    id: base.id,
    relation: base.relation,
    name: base.name,
    sections: sections as MemberDto["sections"],
    notShared: FAMILY_SECTIONS_V1.filter((s) => !granted.includes(s)),
    unavailable,
    partial: ctx.partial.size > 0,
    partialReasons: [...ctx.partial],
    genericLabels: ctx.generic.used,
  };
}

async function stillActive(shareId: string, viewerId: string): Promise<boolean> {
  const [row] = await db
    .select({ status: familyShares.status })
    .from(familyShares)
    .where(and(eq(familyShares.id, shareId), eq(familyShares.viewerId, viewerId)))
    .limit(1);
  return row?.status === "active";
}

export async function assembleFamilyOverview(
  input: AssembleInput,
): Promise<{ members: MemberDto[]; partial: boolean }> {
  const { viewerId, viewerDek } = input;
  const members: MemberDto[] = [];

  // "me": the viewer's own data, every section, own labels decrypted with the viewer's own DEK.
  try {
    const own = new Map<FamilySection, Map<number, string>>();
    for (const s of FAMILY_SECTIONS_V1) {
      if (SECTION_LABEL_SOURCES[s]) own.set(s, await loadOwnSectionLabels(viewerId, s, viewerDek));
    }
    members.push(
      await buildMember(
        { id: "me", relation: "me", name: "Me", ownerId: viewerId },
        [...FAMILY_SECTIONS_V1],
        own,
        input,
      ),
    );
  } catch (err) {
    console.error(`[family] own data failed: ${err instanceof Error ? err.name : "error"}`);
    members.push(unavailableMember("me", "me", "Me"));
  }

  // Must-share-back re-consent: serve only the sections the viewer reciprocates (effective-sections.ts).
  const children = await loadLiveChildren(
    db,
    input.shares.filter((s) => s.mustShareBack).map((s) => s.id),
  );

  const privKey = viewerDek ? await getUserPrivateKeyHex(db, viewerId, viewerDek) : null;

  for (const share of input.shares) {
    const granted = effectiveSectionsOf(share, children.get(share.id));
    try {
      const labels = new Map<FamilySection, Map<number, string>>();
      let keyed = false;
      if (privKey) {
        try {
          await withSectionKeys(share.id, viewerId, privKey, db, async (keys) => {
            for (const s of granted) {
              if (SECTION_LABEL_SOURCES[s]) labels.set(s, await loadSectionLabels(share.ownerId, s, keys[s]));
            }
          });
          keyed = true;
        } catch {
          // no keypair yet / grant not finalized / lost a race with revoke: numbers + generic
          // labels, but only if the share is still active.
          labels.clear();
        }
      }
      if (!keyed && !(await stillActive(share.id, viewerId))) continue;
      const name = (await getUserById(share.ownerId))?.displayName || "A Finlynq user";
      members.push(await buildMember({ id: share.id, relation: "shared", name, ownerId: share.ownerId }, granted, labels, input));
    } catch (err) {
      console.error(`[family] member failed: ${err instanceof Error ? err.name : "error"}`);
      members.push(unavailableMember(share.id, "shared", "A Finlynq user"));
    }
  }

  return { members, partial: members.some((m) => m.partial || m.error != null) };
}

function unavailableMember(id: string, relation: "me" | "shared", name: string): MemberDto {
  return {
    id,
    relation,
    name,
    sections: {},
    notShared: [],
    unavailable: [],
    partial: true,
    partialReasons: ["section_error"],
    genericLabels: false,
    error: "unavailable",
  };
}
