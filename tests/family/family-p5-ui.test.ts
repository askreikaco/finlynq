/**
 * P5 structural checks for the Family Wealth page. Behavioural coverage (mocked fetch against the
 * real API shapes) lives in tests/components/family-page.test.tsx.
 */
import { describe, it, expect, expectTypeOf } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { navGroups } from "@/components/nav";
import { FAMILY_SECTIONS_V1 } from "@/lib/family/sections";
import { FAMILY_STRINGS, MFA_SETUP_HREF } from "@/lib/family/strings";
import type { OverviewResponse as ServerOverview } from "@/lib/family/overview/dto";
import type { OverviewResponse as ClientOverview } from "@/app/(app)/family/_components/types";

const DIR = path.join(__dirname, "../../src/app/(app)/family");
const files = (d: string): string[] =>
  readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(path.join(d, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(d, e.name)] : [],
  );

describe("Family Wealth P5 structure", () => {
  it("adds Family Wealth entry to the Wealth nav group", () => {
    const wealth = navGroups.find((g) => g.label === "Wealth");
    const item = wealth?.items.find((i) => i.label === "Family Wealth");
    expect(item?.href).toBe("/family");
    expect(item?.mode).toBe("prod");
  });

  it("client overview types stay identical to the server DTO (compile-time, tsc)", () => {
    // mutual assignability: fails tsc when either side gains/loses/renames a field
    expectTypeOf<ClientOverview>().toExtend<ServerOverview>();
    expectTypeOf<ServerOverview>().toExtend<ClientOverview>();
    expect(true).toBe(true);
  });

  it("2FA CTA points at the real 2FA settings route", () => {
    expect(MFA_SETUP_HREF).toBe("/settings/account");
    expect(readFileSync(path.join(__dirname, "../../src/app/(app)/settings/account/page.tsx"), "utf8")).toContain("TwoFactor");
    for (const f of files(DIR)) expect(readFileSync(f, "utf8")).not.toContain("/settings/security");
  });

  it("every registry section has a disclosure description string", () => {
    for (const s of FAMILY_SECTIONS_V1) {
      expect(FAMILY_STRINGS[`invite_dialog_section_${s}` as keyof typeof FAMILY_STRINGS]).toBeTruthy();
    }
  });

  it("UI never injects raw HTML and never logs", () => {
    for (const f of files(DIR)) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toContain("dangerouslySetInnerHTML");
      expect(src, f).not.toMatch(/console\.(log|info|debug|warn|error)/);
    }
  });
});
