/**
 * Labels for the VIEWER'S OWN data ("me" member). The viewer decrypts their own rows with their
 * own session DEK: this is never used for another user's data (a shared owner's labels come only
 * from the sidecar via label-decrypt.ts). Only the registered (table, name_ct) pairs are read.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, categories, goals, loans, portfolioHoldings } from "@/db/schema-pg";
import { decryptName } from "@/lib/crypto/encrypted-columns";
import { SECTION_LABEL_SOURCES } from "../label-registry";
import type { FamilySection } from "../sections";

const TABLES = {
  accounts: { id: accounts.id, userId: accounts.userId, nameCt: accounts.nameCt, from: accounts },
  goals: { id: goals.id, userId: goals.userId, nameCt: goals.nameCt, from: goals },
  loans: { id: loans.id, userId: loans.userId, nameCt: loans.nameCt, from: loans },
  categories: { id: categories.id, userId: categories.userId, nameCt: categories.nameCt, from: categories },
  portfolio_holdings: {
    id: portfolioHoldings.id,
    userId: portfolioHoldings.userId,
    nameCt: portfolioHoldings.nameCt,
    from: portfolioHoldings,
  },
} as const;

export async function loadOwnSectionLabels(
  userId: string,
  section: FamilySection,
  ownDek: Buffer | null,
): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  const source = SECTION_LABEL_SOURCES[section];
  if (!source || !ownDek) return out;
  const t = TABLES[source.table as keyof typeof TABLES];
  if (!t) return out;
  const rows = (await db
    .select({ id: t.id, nameCt: t.nameCt })
    .from(t.from as typeof accounts)
    .where(eq(t.userId, userId))) as Array<{ id: number; nameCt: string | null }>;
  for (const r of rows) {
    const name = decryptName(r.nameCt, ownDek, null);
    if (name) out.set(r.id, name);
  }
  return out;
}
