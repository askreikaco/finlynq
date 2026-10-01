/**
 * Family Wealth P1 pure tests (no DB): status machine, sections, label registry.
 */
import { describe, it, expect } from "vitest";
import {
  isValidTransition, VALID_SHARE_STATUSES, type FamilyShareStatus,
} from "@/lib/family/share-status";
import { FAMILY_SECTIONS_V1, FamilySectionSchema, resolveSections } from "@/lib/family/sections";
import {
  SECTION_LABEL_SOURCES, isLabelRegistered, getRegisteredSource,
} from "@/lib/family/label-registry";

const LEGAL: Record<FamilyShareStatus, FamilyShareStatus[]> = {
  pending: ["awaiting_owner_unlock", "declined", "expired", "revoked"],
  awaiting_owner_unlock: ["active", "revoked", "key_reset"],
  active: ["suspended", "revoked", "key_reset"],
  suspended: ["active", "revoked", "key_reset"],
  revoked: [],
  declined: [],
  expired: [],
  key_reset: ["active"],
};

describe("share status machine", () => {
  it("matches the golden transition table for all 64 pairs", () => {
    for (const from of VALID_SHARE_STATUSES) {
      for (const to of VALID_SHARE_STATUSES) {
        expect(isValidTransition(from, to), `${from} -> ${to}`).toBe(LEGAL[from].includes(to));
      }
    }
  });
  it("terminal states have no exits", () => {
    for (const t of ["revoked", "declined", "expired"] as const) {
      expect(VALID_SHARE_STATUSES.some((to) => isValidTransition(t, to))).toBe(false);
    }
  });
});

describe("sections allow-list", () => {
  it("is exactly the plan's 7 sections, none sensitive", () => {
    expect([...FAMILY_SECTIONS_V1]).toEqual([
      "net_worth", "accounts", "investments", "goals", "budgets", "loans", "cashflow",
    ]);
    for (const s of FAMILY_SECTIONS_V1) expect(s).not.toMatch(/payee|note|tag|alias|rule/);
  });
  it("zod rejects unknown sections", () => {
    expect(FamilySectionSchema.safeParse("payee").success).toBe(false);
    expect(FamilySectionSchema.safeParse("accounts").success).toBe(true);
  });
  it("resolveSections drops unknown names and expands all_sections", () => {
    expect(resolveSections(false, ["accounts", "payee"])).toEqual(["accounts"]);
    expect(resolveSections(true, [])).toEqual([...FAMILY_SECTIONS_V1]);
  });
});

describe("label registry allow-list", () => {
  it("covers every section and registers only name_ct columns", () => {
    expect(Object.keys(SECTION_LABEL_SOURCES).sort()).toEqual([...FAMILY_SECTIONS_V1].sort());
    for (const src of Object.values(SECTION_LABEL_SOURCES)) {
      if (!src) continue;
      expect(src.column).toBe("name_ct");
      expect(`${src.table}.${src.column}`).not.toMatch(/payee|note|tag|alias|rule/i);
      expect(src.table).not.toBe("transactions");
    }
  });
  it("refuses payee/note/tags/alias/rules and mismatched columns", () => {
    expect(isLabelRegistered("net_worth", "transactions", "payee")).toBe(false);
    expect(isLabelRegistered("accounts", "transactions", "payee")).toBe(false);
    expect(isLabelRegistered("accounts", "accounts", "alias_ct")).toBe(false);
    expect(isLabelRegistered("accounts", "accounts", "note")).toBe(false);
    expect(isLabelRegistered("budgets", "categories", "tags")).toBe(false);
    expect(isLabelRegistered("accounts", "accounts", "name_ct")).toBe(true);
    expect(getRegisteredSource("net_worth")).toBeNull();
    expect(getRegisteredSource("bogus")).toBeNull();
  });
});
