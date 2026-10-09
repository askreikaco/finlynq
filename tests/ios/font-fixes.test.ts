import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Static assertions for the system-font codemod review fixes (commit 0116a5a4 follow-up).
// Owner rule: standard Tailwind type sizes only; overflow is fixed by room, not smaller text.

const root = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

const TOUCHED = [
  "src/components/account-switcher.tsx",
  "src/app/cloud/page.tsx",
  "src/components/nav.tsx",
  "src/components/portfolio/lot-allocation-matrix.tsx",
  "src/app/(app)/transactions/_components/split-dialog.tsx",
  "src/app/(app)/portfolio/_components/holdings-by-account.tsx",
  "src/app/(app)/portfolio/_components/holdings-table.tsx",
  "src/app/(app)/portfolio/realized-gains/page.tsx",
  "src/components/metric-card.tsx",
];

describe("1. account switcher avatar holds 2-letter initials", () => {
  const src = read("src/components/account-switcher.tsx");
  const avatar = src.match(/<span\s+aria-hidden="true"\s+className="([^"]*bg-primary\/20[^"]*)"/);

  it("avatar circle is size-6 (24px), not the 18px box", () => {
    expect(avatar).not.toBeNull();
    expect(avatar![1]).toContain("size-6");
    expect(avatar![1]).not.toMatch(/h-\[18px\]|w-\[18px\]/);
  });

  it("initials stay on the standard text-xs step", () => {
    expect(avatar![1]).toContain("text-xs");
  });
});

describe("2. MFA 6-digit input keeps wide digit spacing", () => {
  const src = read("src/app/cloud/page.tsx");
  // Element slice: the onChange arrow contains '>', so a [^>]* regex would stop early.
  const at = src.indexOf("maxLength={6}");
  const start = src.lastIndexOf("<input", at);
  const end = src.indexOf("/>", at) + 2;
  const input = at > -1 && start > -1 && end > start ? [src.slice(start, end)] : null;

  it("uses the standard tracking-widest utility, no arbitrary tracking value", () => {
    expect(input).not.toBeNull();
    expect(input![0]).toMatch(/\btracking-widest\b/);
    expect(input![0]).not.toMatch(/tracking-\[/);
  });

  it("still fits six digits: full-width, maxLength 6, text-2xl", () => {
    expect(input![0]).toContain("w-full");
    expect(input![0]).toMatch(/maxLength=\{6\}/);
    expect(input![0]).toContain("text-2xl");
  });
});

describe("3. mobile bottom bar labels truncate at 320-390px", () => {
  const src = read("src/components/nav.tsx");
  const bar = src.slice(src.indexOf("export const MobileBottomBar"));

  it("each tab label is wrapped in a truncating span", () => {
    const spans = bar.match(/<span className="[^"]*truncate[^"]*">\{item\.label\}<\/span>/g) ?? [];
    expect(spans.length).toBe(1);
    expect(bar).toMatch(/<span className="block max-w-full truncate">More<\/span>/);
  });

  it("link keeps text-xs and min-w-0 flex-1 (no truncate on the flex item itself)", () => {
    const linkCls = bar.match(/className=\{cn\(\s*"([^"]*flex-1[^"]*)"/);
    expect(linkCls).not.toBeNull();
    expect(linkCls![1]).toContain("text-xs");
    expect(linkCls![1]).toContain("min-w-0");
    expect(linkCls![1]).not.toMatch(/\btruncate\b/);
  });
});

describe("4. fixed-size boxes grown for 12px text", () => {
  it("lot allocation matrix inputs are h-7 w-16 (not w-[58px] h-6)", () => {
    const src = read("src/components/portfolio/lot-allocation-matrix.tsx");
    const cls = src.match(/const inputCls = "([^"]*)"/)![1];
    expect(cls).toContain("w-16");
    expect(cls).toContain("h-7");
    expect(cls).not.toMatch(/w-\[58px\]|h-6\b/);
  });

  it("lot matrix sell and total columns use min-w-28 (not min-w-[92px])", () => {
    const src = read("src/components/portfolio/lot-allocation-matrix.tsx");
    expect(src).not.toContain("min-w-[92px]");
    expect(src.match(/min-w-28/g)?.length).toBe(2);
  });

  it("split dialog Amount column is 96px in header and rows", () => {
    const src = read("src/app/(app)/transactions/_components/split-dialog.tsx");
    expect(src).not.toContain("1fr_1fr_80px_1fr_1fr_32px");
    expect(src.match(/grid-cols-\[1fr_1fr_96px_1fr_1fr_32px\]/g)?.length).toBe(2);
  });

  it("holdings badges with text-xs are h-5, not h-4", () => {
    for (const f of [
      "src/app/(app)/portfolio/_components/holdings-by-account.tsx",
      "src/app/(app)/portfolio/_components/holdings-table.tsx",
      "src/app/(app)/portfolio/realized-gains/page.tsx",
    ]) {
      const src = read(f);
      expect(src, f).not.toMatch(/text-xs h-4\b/);
      expect(src, f).toMatch(/text-xs h-5\b/);
    }
  });

  it("metric card number steps text-2xl at the 13rem container (no 30px step inside 13rem)", () => {
    const src = read("src/components/metric-card.tsx");
    const cls = src.match(/const numberSize = size === "hero" \? "([^"]*)" : "([^"]*)"/);
    expect(cls).not.toBeNull();
    expect(cls![2]).toContain("@[13rem]:text-2xl");
    expect(cls![2]).not.toContain("@[13rem]:text-3xl");
    expect(src).toMatch(/break-words/);
  });
});

describe("5. font-sans follows the UI font picker", () => {
  const css = read("src/app/globals.css");

  it("@theme inline maps --font-sans to the runtime --font-ui, not the fixed system stack", () => {
    const theme = css.match(/@theme inline \{[\s\S]*?\n\}/)![0];
    expect(theme).toMatch(/--font-sans:\s*var\(--font-ui\);/);
    expect(theme).not.toMatch(/--font-sans:\s*var\(--font-stack-sans\)/);
  });

  it("the iOS @supports body rule is left as-is (native body style, family re-set to --font-ui)", () => {
    expect(css).toMatch(/@supports \(font: -apple-system-body\)\s*\{\s*body\s*\{\s*font: -apple-system-body;\s*font-family: var\(--font-ui\);/);
  });
});

describe("no new arbitrary text sizes in touched files", () => {
  it.each(TOUCHED)("%s has no text-[Npx] or text-[Nrem] classes", (f) => {
    expect(read(f)).not.toMatch(/text-\[\d+(\.\d+)?(px|rem)\]/);
  });
});
