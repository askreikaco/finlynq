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

  it("pins at the safe-area inset below regular and at 0 from regular (640px)", () => {
    expect(tokens).toContain("top-[var(--sat,0px)]");
    expect(tokens).toContain("regular:top-0");
    expect(tokens).not.toContain("max-regular:top-0");
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
    expect(settingsShell).toMatch(/data-slot="settings-detail-bar" className=\{PHONE_BAR\}/);
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

describe("admin pages", () => {
  const ADMIN = "src/app/(app)/admin";
  /** Admin pages whose PageHeader (or the shared `Heading` element) must pin to a tall container. */
  const PAGES: Array<{ file: string; anchor: string }> = [
    { file: `${ADMIN}/email-inbox/page.tsx`, anchor: "<PageHeader" },
    { file: `${ADMIN}/feedback/page.tsx`, anchor: "<PageHeader" },
    { file: `${ADMIN}/(env)/api-log/page.tsx`, anchor: "<PageHeader" },
    { file: `${ADMIN}/(env)/system/page.tsx`, anchor: "<PageHeader" },
    { file: `${ADMIN}/(env)/price-cache/page.tsx`, anchor: "<PageHeader" },
    { file: `${ADMIN}/(env)/diagnostics/page.tsx`, anchor: "<PageHeader" },
    { file: `${ADMIN}/announcements/page.tsx`, anchor: "<PageHeader" },
    { file: `${ADMIN}/inbox/page.tsx`, anchor: "<PageHeader" },
    { file: `${ADMIN}/page.tsx`, anchor: "<PageHeader" },
    { file: `${ADMIN}/(env)/integrations/page.tsx`, anchor: "{Heading}" },
  ];

  /** Every occurrence of `anchor` in `src`, as indices. */
  function occurrences(src: string, anchor: string): number[] {
    const out: number[] = [];
    for (let i = src.indexOf(anchor); i > -1; i = src.indexOf(anchor, i + 1)) out.push(i);
    return out;
  }

  /** className of each open <div>/<motion.div> enclosing `idx`, outermost first, inside the JSX of the nearest `return (` before it. */
  function divAncestors(src: string, idx: number): string[] {
    const start = src.lastIndexOf("return (", idx);
    expect(start, "a `return (` precedes the anchor").toBeGreaterThan(-1);
    const stack: string[] = [];
    const re = /<(\/?)((?:motion\.)?div)\b([^>]*)>/g;
    re.lastIndex = start;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) && m.index < idx) {
      if (m[1]) stack.pop();
      else if (!m[3].trimEnd().endsWith("/")) stack.push(m[3].match(/className="([^"]*)"/)?.[1] ?? "");
    }
    return stack;
  }

  it("every PageHeader is a direct child of the page root or inside display:contents wrappers only", () => {
    const bad: string[] = [];
    for (const { file, anchor } of PAGES) {
      const src = read(file);
      for (const idx of occurrences(src, anchor)) {
        const anc = divAncestors(src, idx);
        if (anc.slice(1).some((c) => !/(^|\s)contents(\s|$)/.test(c))) bad.push(`${file}@${idx}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("no admin PageHeader carries a margin on its own bar (margins go on the next sibling)", () => {
    const bad: string[] = [];
    for (const { file } of PAGES) {
      const src = read(file);
      for (const m of src.matchAll(/<PageHeader\b([\s\S]*?)\/>/g)) {
        const cls = m[1].match(/className="([^"]*)"/)?.[1] ?? "";
        if (/(^|\s)(max-md:|md:)?-?m[trblxy]?-/.test(cls)) bad.push(file);
      }
    }
    expect(bad).toEqual([]);
  });

  it("no ancestor of an admin PageHeader is a scroll container (overflow-hidden/auto/scroll breaks sticky)", () => {
    const bad: string[] = [];
    for (const { file, anchor } of PAGES) {
      const src = read(file);
      for (const idx of occurrences(src, anchor)) {
        if (divAncestors(src, idx).some((c) => /(^|\s)(max-md:|md:)?overflow-(x-|y-)?(hidden|auto|scroll)(\s|$)/.test(c))) bad.push(`${file}@${idx}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe("non-admin pages", () => {
  // Sticky pins only inside its containing block: the nearest ancestor that spans the page. A PageHeader
  // whose parent is a header-only wrapper (a flex row or a short div) never stays on screen.
  // Static check: walk the open div-like ancestors of the PageHeader tag, skipping display:contents
  // wrappers, and require the first real ancestor to be a tall page container.
  const TALL = /(^|\s)(space-y-\d+|flex-col|min-h-screen|container|mx-auto|max-w-\w+)(\s|$)/;

  function classOf(attrs: string): string {
    const m = attrs.match(/className=\{?[^"'`]*["'`]([^"'`]*)/);
    return m ? m[1] : "";
  }

  /** Open div-like ancestors of `at`, outermost first (self-closing tags and closed elements excluded). */
  function ancestorsAt(src: string, at: number): string[] {
    const stack: string[] = [];
    const re = /<(\/?)(div|motion\.div)\b((?:[^>]|=>)*)>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) && m.index < at) {
      if (m[1]) stack.pop();
      else if (!m[3].trimEnd().endsWith("/")) stack.push(classOf(m[3]));
    }
    return stack;
  }

  /** Class list of the first ancestor that is not a display:contents wrapper ("" if none). */
  function effectiveParent(src: string, at: number): string {
    const stack = ancestorsAt(src, at).filter((c) => !/(^|\s)contents(\s|$)/.test(c));
    return stack.length ? stack[stack.length - 1] : "";
  }

  function pageHeaderParent(file: string, nth = 0): string {
    const src = read(file);
    let idx = -1;
    for (let i = 0; i <= nth; i++) idx = src.indexOf("<PageHeader", idx + 1);
    expect(idx, `${file} has PageHeader #${nth}`).toBeGreaterThan(-1);
    return effectiveParent(src, idx);
  }

  const FIXED_PAGES = [
    "src/app/(app)/fire/page.tsx",
    "src/app/(app)/whats-new/page.tsx",
    "src/app/(app)/api-docs/page.tsx",
    "src/app/(app)/settings/import/reconcile-visibility/page.tsx",
    "src/app/(app)/transactions/audit/page.tsx",
    "src/app/(app)/categories/[id]/page.tsx",
    "src/app/(app)/portfolio/new/page.tsx",
    "src/app/(app)/portfolio/realized-gains/page.tsx",
    "src/app/(app)/portfolio/dividends/page.tsx",
    "src/app/(app)/settings/backfill/[runId]/page.tsx",
    "src/app/(app)/feedback/page.tsx",
    "src/app/(app)/import/pending/_components/staged-list-view.tsx",
  ];

  it.each(FIXED_PAGES)("%s: PageHeader sits directly in a tall page container", (file) => {
    const parent = pageHeaderParent(file);
    expect(parent).toMatch(TALL);
    expect(parent).not.toMatch(/justify-between/);
  });

  it("import/pending reconcile-header is a fragment rendered directly in the tall staged-review root", () => {
    const header = read("src/app/(app)/import/pending/_components/reconcile-header.tsx");
    expect(header).toMatch(/return \(\s*<>\s*<button[\s\S]*?<PageHeader\b/);
    const surface = read("src/components/import/staged-review-surface.tsx");
    expect(surface).toMatch(/<div className="flex flex-col gap-4 regular:h-\[calc\(100dvh-8rem\)\]">\s*<ReconcileHeader/);
  });

  it("no header-only wrapper: no page or component in (app) holds a PageHeader in a justify-between row or a bare div", () => {
    const files = walk(join(ROOT, "src/app/(app)"))
      .filter((f) => f.endsWith(".tsx") && !f.includes("/admin/"));
    const bad: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      let idx = src.indexOf("<PageHeader");
      while (idx > -1) {
        const parent = effectiveParent(src, idx);
        // Fragment-returning components have no in-file wrapper; their caller is checked above.
        if (parent !== "" && !TALL.test(parent)) bad.push(`${relative(ROOT, f)}: "${parent}"`);
        idx = src.indexOf("<PageHeader", idx + 1);
      }
    }
    expect(bad).toEqual([]);
  });
});
