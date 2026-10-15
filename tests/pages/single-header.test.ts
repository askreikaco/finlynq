// @vitest-environment node
// Single global top bar: every page under src/app/(app) renders the one PageHeader (components/mobile/page-header.tsx),
// no page or component builds its own bar from the PHONE_BAR* primitives, and no page renders two PageHeaders on one
// render path. Source-level and pragmatic: a page's render path is the page file plus the local component files it
// imports (relative, @/components, @/app/(app)), followed to depth 3. Ignores route-only files and components/ui.
// Page templates (src/components/templates/*) are not followed: a page that calls one (<ListPage>, <SectionPage>, ...)
// gets that template's single PageHeader per call site, and each template file itself must render its declared count.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync, statSync } from "fs";
import { join, relative, dirname, resolve } from "path";

const ROOT = join(__dirname, "../..");
const SRC = join(ROOT, "src");
const APP = join(SRC, "app/(app)");
const PAGE_HEADER = join(SRC, "components/mobile/page-header.tsx");

/** Non-(app) pages are out of scope. Pages below are exempt, each with a reason. */
const EXEMPTIONS: Record<string, string> = {
  "settings/": "settings area: renders inside SettingsShell (its own detail bar); owned by the hdr-settings audit",
  "account/": "account area: renders inside AccountShell; owned by the account audit, not this scope",
  "connect/page.tsx": "wrapper: SettingsShell + the settings Integrations page (settings area)",
};

/**
 * Static count of `<PageHeader` on a page's render path. A page normally has one. Higher counts are the page's
 * exclusive early-return branches (loading / missing / main), plus PageHeaders in delegates that are rendered only
 * under a prop (showHeader={false}, embedded). Any change to these counts fails here: re-review the branch first.
 */
const EXPECTED_MULTI: Record<string, { count: number; reason: string }> = {
  "dev/gallery/page.tsx": { count: 7, reason: "the page's own bar (1) + the six top bar specimens of the Top bar section (TopBarDemos: bordered, non-sticky demo frames)" },
  "more/page.tsx": { count: 2, reason: "ColumnShell (cascading columns, wide only) renders the More list in col 1 and the Settings hub in col 2; each has its own column header, and the stacked phone view renders only the leaf" },
  "transactions/page.tsx": { count: 5, reason: "workspace header (showHeader) + the split pane's TransactionFormScreen branches, rendered embedded (compact pane header instead of the page bar)" },
  "transactions/new/page.tsx": { count: 4, reason: "TransactionFormScreen: loading, Missing, shared entry screen and legacy form fallback branches (exclusive; the create mode renders only the entry screen)" },
  "subscriptions/page.tsx": { count: 3, reason: "SectionPage header (1) + the split pane's SubscriptionFormPanel create and edit FormPage branches, rendered embedded (compact pane header)" },
  "subscriptions/new/page.tsx": { count: 2, reason: "SubscriptionFormPanel: create and edit FormPage branches (exclusive, mode picks one)" },
  "subscriptions/[id]/edit/page.tsx": { count: 2, reason: "SubscriptionFormPanel: create and edit FormPage branches (exclusive, mode picks one)" },
  "loans/page.tsx": { count: 3, reason: "SectionPage header (1) + the split pane's LoanFormPanel create and edit FormPage branches, rendered embedded (compact pane header)" },
  "loans/new/page.tsx": { count: 2, reason: "LoanFormPanel: create and edit FormPage branches (exclusive, mode picks one)" },
  "loans/[id]/edit/page.tsx": { count: 2, reason: "LoanFormPanel: create and edit FormPage branches (exclusive, mode picks one)" },
  "subscriptions/[id]/page.tsx": { count: 2, reason: "DetailPage: the loading shell header and the loaded header (exclusive); the subscriptions detail content has no header of its own (the split pane renders it under the compact pane header)" },
  "loans/[id]/page.tsx": { count: 2, reason: "DetailPage: the loading shell header and the loaded header (exclusive); the loans detail content has no header of its own (the split pane renders it under the compact pane header)" },
  "goals/[id]/page.tsx": { count: 2, reason: "DetailPage: the loading shell header and the loaded header (exclusive); the goals detail content has no header of its own (the split pane renders it under the compact pane header)" },
  "goals/page.tsx": { count: 3, reason: "ListPage header (1) + the split pane's GoalFormPanel create and edit FormPage branches, rendered embedded (compact pane header)" },
  "goals/new/page.tsx": { count: 2, reason: "GoalFormPanel: create and edit FormPage branches (exclusive, mode picks one)" },
  "goals/[id]/edit/page.tsx": { count: 2, reason: "GoalFormPanel: create and edit FormPage branches (exclusive, mode picks one)" },
  "accounts/new/page.tsx": { count: 2, reason: "AccountFormPanel create branch (FormPage, 1) + the edit view header; exclusive (mode picks one)" },
  "accounts/[id]/edit/page.tsx": { count: 2, reason: "AccountFormPanel: the create branch (FormPage, 1) and the edit view header (page only; the pane renders its own compact header), exclusive" },
  "accounts/[id]/page.tsx": { count: 6, reason: "AccountDetail (shared with the split pane): not-found, loading and main branches (exclusive; none when embedded, the pane header replaces them) + TransactionsWorkspace header (showHeader=false here) + the exclusive branches of the workspace pane's TransactionFormScreen (the pane is off for the locked workspace)" },
  "categories/page.tsx": { count: 3, reason: "the page bar (1) + CategoryDetail page-mode header (0 when embedded in the split pane) + CategoryFormPanel FormPage (1, embedded: compact pane header); the pane never renders them together with the page bar" },
  "accounts/page.tsx": { count: 10, reason: "empty-state and list branches (exclusive) + the split pane's AccountFormPanel (create FormPage + edit view header), which render a compact pane header, not the page bar + the split pane's AccountDetail (6, as accounts/[id]/page.tsx; embedded it renders none of them, the pane header replaces them)" },
  "admin/page.tsx": { count: 3, reason: "loading, error and main branches (exclusive), each a SectionPage call (batch 4)" },
  "admin/(env)/integrations/page.tsx": { count: 2, reason: "loading and ready branches (exclusive), each a SectionPage call (batch 5)" },
  "settings/investments/page.tsx": { count: 3, reason: "loading, error and ready branches (exclusive), each a SectionPage call (batch 4)" },
  "import/page.tsx": { count: 6, reason: "loading, no-accounts, pick-account and main branches (exclusive, each a SectionPage call) + 2 route-only headers in staged-review delegates (not rendered when embedded, which /import uses)" },
  "import/pending/page.tsx": { count: 2, reason: "StagedListView (list) or ReconcileHeader (detail), never both" },
  "transactions/[id]/edit/page.tsx": { count: 4, reason: "loading, Missing, shared entry screen and legacy form fallback branches (exclusive)" },
  "transactions/[id]/split/page.tsx": { count: 3, reason: "loading, missing and form branches (exclusive)" },
  "transactions/transfer/[linkId]/edit/page.tsx": { count: 4, reason: "TransactionFormScreen: Missing, loading, shared entry screen and TransactionEditForm (legacy fallback) branches, exclusive" },
};

/**
 * Page templates: a call site (`<SectionPage ...>`) renders the template's PageHeader once. TEMPLATE_MULTI pins the
 * templates whose own PageHeader literals are exclusive branches (one call renders one of them).
 */
const TEMPLATE_FILES: Record<string, string> = {
  SectionPage: "section-page.tsx",
  ListPage: "list-page.tsx",
  FormPage: "form-page.tsx",
  DetailPage: "detail-page.tsx",
  ReportPage: "report-page.tsx",
};
const TEMPLATE_MULTI: Record<string, { count: number; reason: string }> = {
  "detail-page.tsx": { count: 2, reason: "placeholder (loading/not-found DetailShell) and main branches (exclusive)" },
};
const TEMPLATE_DIR = join(SRC, "components/templates");
const TEMPLATE_CALL_RE = new RegExp(`<(${Object.keys(TEMPLATE_FILES).join("|")})(?![\\w])`, "g");

/** Files outside page-header.tsx allowed to import the PHONE_BAR* primitives. TODO: remove settings-shell.tsx once hdr-settings drops its use. */
const PHONE_BAR_ALLOW = new Set([
  "src/components/settings-shell.tsx", // TODO(hdr-settings): remove this entry when settings-shell stops using PHONE_BAR*
]);

const PHONE_BAR_RE = /\bPHONE_BAR(_[A-Z]+)?\b/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(tsx|ts)$/.test(name) && !/\.test\.(tsx|ts)$/.test(name)) out.push(full);
  }
  return out;
}

function rel(p: string): string {
  return relative(ROOT, p).split("\\").join("/");
}

/** Local imports of a file that can hold render output: relative, @/components, or @/app/(app). */
function localImports(file: string): string[] {
  const src = readFileSync(file, "utf8");
  const specs = [...src.matchAll(/(?:from\s+|import\s*\(\s*)["']([^"']+)["']/g)].map((m) => m[1]);
  const out: string[] = [];
  for (const spec of specs) {
    let base: string | null = null;
    if (spec.startsWith("./") || spec.startsWith("../")) base = resolve(dirname(file), spec);
    else if (spec.startsWith("@/components/") || spec.startsWith("@/app/(app)/")) base = join(SRC, spec.slice(2));
    if (!base) continue;
    for (const cand of [base, `${base}.tsx`, `${base}.ts`, join(base, "index.tsx"), join(base, "index.ts")]) {
      if (existsSync(cand) && statSync(cand).isFile()) {
        const r = rel(cand);
        if (/\/components\/ui\//.test(r) || /\.test\.tsx?$/.test(r)) break;
        if (/\/page\.tsx$/.test(r) && cand !== file) break; // other routes are not delegates
        if (cand.startsWith(TEMPLATE_DIR + "/")) break; // templates count via their call sites, not as delegates
        out.push(cand);
        break;
      }
    }
  }
  return out;
}

/** The page file plus the components it delegates to, to depth 3. */
function renderPath(page: string): string[] {
  const seen = new Set<string>([page]);
  let frontier = [page];
  for (let depth = 0; depth < 3; depth++) {
    const next: string[] = [];
    for (const f of frontier) {
      for (const dep of localImports(f)) {
        if (seen.has(dep)) continue;
        seen.add(dep);
        next.push(dep);
      }
    }
    frontier = next;
  }
  return [...seen];
}

function count(src: string, needle: RegExp): number {
  return (src.match(needle) ?? []).length;
}

const pages = walk(APP)
  .filter((f) => f.endsWith("/page.tsx") || f.endsWith("\\page.tsx"))
  .map((f) => ({ file: f, rel: relative(APP, f).split("\\").join("/") }))
  .filter((p) => !Object.keys(EXEMPTIONS).some((k) => (k.endsWith("/") ? p.rel.startsWith(k) : p.rel === k)));

const paths = new Map(pages.map((p) => [p.rel, renderPath(p.file)]));

/** PageHeaders one file contributes: its own literals, plus one per template call site (template contributes its PageHeader). */
function headersIn(src: string): number {
  let n = count(src, /<PageHeader[\s>\n]/g);
  for (const m of src.matchAll(TEMPLATE_CALL_RE)) {
    const file = TEMPLATE_FILES[m[1]];
    n += TEMPLATE_MULTI[file]?.count ?? 1;
  }
  return n;
}

describe("single global PageHeader per (app) page", () => {
  it("scans a meaningful set of pages", () => {
    expect(pages.length).toBeGreaterThan(55);
  });

  it("every template file renders exactly the PageHeader count its call sites are credited with", () => {
    const bad: string[] = [];
    for (const [, file] of Object.entries(TEMPLATE_FILES)) {
      const src = readFileSync(join(TEMPLATE_DIR, file), "utf8");
      const n = count(src, /<PageHeader[\s>\n]/g);
      const want = TEMPLATE_MULTI[file]?.count ?? 1;
      if (n !== want) bad.push(`${file}: ${n} (credited ${want})`);
    }
    expect(bad).toEqual([]);
  });

  it("every non-exempt (app) page renders the global <PageHeader (directly, via its delegates, or via a template call)", () => {
    const missing = pages
      .filter((p) => !paths.get(p.rel)!.some((f) => headersIn(readFileSync(f, "utf8")) > 0))
      .map((p) => p.rel);
    expect(missing).toEqual([]);
  });

  it("each page renders exactly one <PageHeader on its render path (EXPECTED_MULTI pins the exclusive-branch counts)", () => {
    const offenders: string[] = [];
    for (const p of pages) {
      const n = paths.get(p.rel)!.reduce((sum, f) => sum + headersIn(readFileSync(f, "utf8")), 0);
      const allowed = EXPECTED_MULTI[p.rel]?.count ?? 1;
      if (n !== allowed) offenders.push(`${p.rel}: ${n} (allowed ${allowed})`);
    }
    expect(offenders).toEqual([]);
  });

  it("no page content builds a second header-like element (own <h1> or <header>) outside page-header.tsx", () => {
    const offenders: string[] = [];
    for (const p of pages) {
      for (const f of paths.get(p.rel)!) {
        if (f === PAGE_HEADER) continue;
        const src = readFileSync(f, "utf8");
        if (/<h1[\s>]/.test(src) || /<header[\s>]/.test(src)) offenders.push(`${p.rel} -> ${rel(f)}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("PHONE_BAR* primitives", () => {
  it("are imported only by page-header.tsx (TODO: settings-shell.tsx is allow-listed until hdr-settings removes it)", () => {
    const offenders = walk(SRC)
      .filter((f) => f !== PAGE_HEADER)
      .filter((f) => PHONE_BAR_RE.test(readFileSync(f, "utf8")))
      .map(rel)
      .filter((r) => !PHONE_BAR_ALLOW.has(r));
    expect(offenders).toEqual([]);
  });

  it("the allow list holds exactly the one TODO entry (settings-shell.tsx)", () => {
    expect([...PHONE_BAR_ALLOW]).toEqual(["src/components/settings-shell.tsx"]);
  });
});

describe("exemptions", () => {
  it("each exemption has a reason and every exempt path exists", () => {
    for (const [k, reason] of Object.entries(EXEMPTIONS)) {
      expect(reason.length).toBeGreaterThan(10);
      const target = join(APP, k);
      expect(existsSync(target), `exempt path ${k} exists`).toBe(true);
    }
  });
});
