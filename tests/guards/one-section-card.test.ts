// One card-with-a-title: src/components/mobile/section-card.tsx (label inside/outside, description, InfoTip, list).
import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const grep = (cmd: string) =>
  execSync(`${cmd} || true`, { encoding: "utf8" })
    .split("\n")
    .filter(Boolean);

describe("one section card", () => {
  it("the parallel InsetGroup / InsetSectionHeader are gone", () => {
    expect(existsSync(join(process.cwd(), "src/components/mobile/inset-group.tsx"))).toBe(false);
    const out = grep("grep -rlE 'InsetGroup|InsetSectionHeader|inset-group' src tests --include=*.ts --include=*.tsx").filter(
      (f) => f !== "tests/guards/one-section-card.test.ts",
    );
    expect(out).toEqual([]);
  });

  it("SectionCard exposes placement, description, info, bare and list", () => {
    const src = read("src/components/mobile/section-card.tsx");
    for (const prop of ["labelPlacement", "descriptionPlacement", "description", "info", "bare", "list"]) {
      expect(src, prop).toMatch(new RegExp(`\\b${prop}\\??:`));
    }
    expect(src).toContain('from "@/components/ui/info-tip"');
  });

  it("no page hand-rolls a divided list on a SectionCard (use `list`)", () => {
    expect(grep("grep -rnE '<SectionCard[^>]*list-divider' src --include=*.tsx")).toEqual([]);
  });
});
