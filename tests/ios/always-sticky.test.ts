// @vitest-environment node
// Always-sticky top bar: PHONE_BAR is sticky at every breakpoint, the settings detail row and the
// new-transaction header use it, and no ancestor between a bar and its scroll container breaks sticky
// (overflow-* that makes a box the scroller, or a wrapper only as tall as the bar). Source-level.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join, relative } from "path";

const ROOT = join(__dirname, "../..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const pageHeader = read("src/components/mobile/page-header.tsx");
const settingsShell = read("src/components/settings-shell.tsx");
const newTx = read("src/app/(app)/transactions/new/page.tsx");
const appLayout = read("src/app/(app)/layout.tsx");
const dashboard = read("src/app/(app)/dashboard/page.tsx");
const investments = read("src/app/(app)/settings/investments/page.tsx");
const overview = read("src/app/(app)/family/_components/overview-tab.tsx");

/** Value of `export const NAME =\n  "..."` (string literal body). */
function constant(name: string): string {
  const m = pageHeader.match(new RegExp(`export const ${name} =\\s*\\n?\\s*"([^"]+)"`));
  expect(m, `${name} defined as a string literal`).not.toBeNull();
  return m![1];
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, name.name);
    if (name.isDirectory()) walk(full, out);
    else if (/\.(tsx|ts)$/.test(name.name)) out.push(full);
  }
  return out;
}

describe("PHONE_BAR is sticky at every breakpoint", () => {
  const bar = constant("PHONE_BAR");
  const tokens = bar.split(/\s+/);

  it("has sticky with no breakpoint prefix", () => {
    expect(tokens).toContain("sticky");
    expect(tokens.filter((t) => /^(max-|md:|sm:|lg:)sticky$/.test(t))).toEqual([]);
  });

  it("pins at the safe-area inset below md and at 0 on md+", () => {
    expect(tokens).toContain("top-[var(--sat,0px)]");
    expect(tokens).toContain("md:top-0");
    expect(tokens).not.toContain("max-md:top-0");
  });

  it("keeps the glass material and the sticky core shared with the new-transaction header", () => {
    const core = constant("PHONE_BAR_STICKY").split(/\s+/);
    expect(core).toContain("sticky");
    expect(core).toContain("glass-bar");
    for (const t of core) expect(tokens).toContain(t);
  });
});

describe("bars that must use the sticky bar", () => {
  it("settings detail row (back row) is built from PHONE_BAR", () => {
    expect(settingsShell).toMatch(/cn\(PHONE_BAR,/);
  });

  it("new-transaction header is built from PHONE_BAR_STICKY", () => {
    expect(newTx).toMatch(/data-testid="txnew-topbar"[\s\S]{0,200}PHONE_BAR_STICKY/);
  });

  it("no page or shell defines its own glass bar literal (only page-header and the two users above)", () => {
    const files = walk(join(ROOT, "src/app/(app)")).concat(walk(join(ROOT, "src/components")));
    const offenders = files
      .filter((f) => !f.endsWith("components/mobile/page-header.tsx"))
      .filter((f) => /className=["'`][^"'`]*(?<![\w-])glass-bar(?![\w-])/.test(readFileSync(f, "utf8")))
      .map((f) => relative(ROOT, f));
    expect(offenders).toEqual([]);
  });

  it("every <header> element in the app is sticky (or built from the shared bar)", () => {
    // App surfaces only: the public landing page (components/landing) has its own marketing nav.
    const files = walk(join(ROOT, "src/app/(app)")).concat(walk(join(ROOT, "src/components/mobile")), walk(join(ROOT, "src/components/settings")));
    const bad: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/<header\b/g)) {
        const window = src.slice(m.index!, m.index! + 400);
        if (!/sticky|PHONE_BAR/.test(window)) bad.push(`${relative(ROOT, f)}@${m.index}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe("no ancestor breaks sticky (scroll container and containing block)", () => {
  it("settings content slot is not a scroll container at any breakpoint", () => {
    expect(settingsShell).toContain('<div className="overflow-x-clip">{children}</div>');
    expect(settingsShell).not.toContain("md:overflow-x-auto");
    expect(settingsShell).not.toContain("max-md:overflow-x-clip md:");
  });

  it("<main> is not a scroll container at any breakpoint (the window scrolls, sticky pins to it)", () => {
    const main = appLayout.match(/<main className="([^"]+)"/)![1];
    expect(main).not.toMatch(/(^|\s)(max-md:)?overflow-(x-|y-)?(hidden|auto|scroll)(\s|$)/);
    expect(main).not.toMatch(/(^|\s)(max-md:)?overflow-y-(hidden|auto|scroll)(\s|$)/);
  });

  it("dashboard header wrapper is display:contents at every breakpoint (parent spans the page)", () => {
    expect(dashboard).toMatch(/<motion\.div variants=\{itemVariants\} className="contents">\s*<PageHeader/);
    expect(dashboard).not.toMatch(/max-md:contents">\s*<PageHeader/);
  });

  it("settings investments header wrapper is display:contents (parent spans the page)", () => {
    expect(investments).toMatch(/<div className="contents">\s*<PageHeader/);
  });

  it("family filter toolbar is static on md+ so it cannot overlap the sticky PageHeader", () => {
    expect(overview).toContain("md:static");
    expect(overview).not.toContain("md:top-[var(--sat)]");
  });

  it("no PageHeader className passes a position class that would drop sticky (twMerge)", () => {
    const files = walk(join(ROOT, "src/app")).filter((f) => f.endsWith(".tsx"));
    const bad: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/<PageHeader\b[^>]*?className="([^"]*)"/g)) {
        if (/(^|\s)(relative|absolute|fixed|static|sticky)(\s|$)/.test(m[1])) bad.push(relative(ROOT, f));
      }
    }
    expect(bad).toEqual([]);
  });
});
