// @vitest-environment node
// One top bar (owner 2026-10-15). Source guard: PageHeader (src/components/mobile/page-header.tsx) is the ONLY
// component that draws the page top bar. No other header component, no hand-rolled bar, no legacy action API.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join, relative } from "path";

const ROOT = join(__dirname, "../..");
const HEADER = "src/components/mobile/page-header.tsx";

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.(tsx|ts)$/.test(e.name)) out.push(full);
  }
  return out;
}

/** Source without comments, so prose about the bar is not mistaken for a second bar. */
const code = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const SRC = walk(join(ROOT, "src")).map((f) => ({ path: relative(ROOT, f), text: readFileSync(f, "utf8") }));
const APP_SRC = SRC.filter((f) => !f.path.startsWith("src/app/(app)/dev/") && f.path.endsWith(".tsx"));

/** Opening tags of `<name ...>` (balanced braces) for every occurrence in a file. */
function tagsOf(text: string, name: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${name}\\b`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    let i = m.index + m[0].length;
    let depth = 0;
    for (; i < text.length; i++) {
      const c = text[i];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0 && text[i - 1] !== "=") break;
    }
    out.push(text.slice(m.index, i + 1));
  }
  return out;
}

describe("PageHeader is the only top bar", () => {
  it("scans the source tree (vacuity guard)", () => {
    expect(SRC.length).toBeGreaterThan(300);
    expect(SRC.filter((f) => /<PageHeader\b/.test(f.text)).length).toBeGreaterThan(15);
  });

  it("only page-header.tsx draws the bar: data-slot, page-header-bleed, glass-bar", () => {
    const offenders = SRC.filter(
      (f) => f.path !== HEADER && /data-slot="page-header"|page-header-bleed|["'` ]glass-bar[ "'`]/.test(code(f.text)) && !f.path.endsWith("dev/gallery/page.tsx"),
    ).map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it("the only page-level <h1> in the app shell is PageHeader's title", () => {
    const offenders = SRC.filter(
      (f) =>
        f.path !== HEADER &&
        f.path.endsWith(".tsx") &&
        /<h1\b/.test(f.text) &&
        // public / marketing / auth / oauth pages are not app pages with a top bar
        (f.path.startsWith("src/app/(app)/") || (f.path.startsWith("src/components/") && !/landing|mcp-guide|auth\//.test(f.path))),
    ).map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it("the bar's controls exist once: no other file defines a back button, a More menu or a primary action cell", () => {
    const defs = SRC.filter((f) => /export (function|const) (BackButton|MoreActionsMenu|OverflowMenu|HeaderStatus)\b/.test(f.text)).map((f) => f.path).sort();
    expect(defs).toEqual(["src/components/mobile/back-button.tsx", HEADER]);
  });

  it("removed header APIs are gone from src (no shims, no dead exports)", () => {
    const gone = /\b(HEADER_SECONDARY|HEADER_DESKTOP_ONLY|HEADER_MAX_PHONE_ACTIONS|HEADER_CELL|HEADER_SAVE|HeaderStatus|OverflowAction|OverflowMenu|PHONE_BAR_[A-Z_]+|PHONE_CAPSULE|splitPhoneActions|splitHeaderSave|withPhonePrimary)\b/;
    const offenders = SRC.filter((f) => gone.test(f.text)).map((f) => `${f.path}: ${gone.exec(f.text)![0]}`);
    expect(offenders).toEqual([]);
  });

  it("no call site passes a legacy or ad-hoc prop to PageHeader or a template's header slot", () => {
    const legacy = /\b(actions|overflow|backHref|backLabel|backFallback|onBack|belowTitle|lead|subtitle|className|titleClassName|subtitleClassName|actionsClassName|leadClassName)\s*=/;
    const offenders: string[] = [];
    for (const f of APP_SRC) {
      for (const t of tagsOf(f.text, "PageHeader")) {
        if (f.path === HEADER) continue;
        const m = legacy.exec(t);
        if (m) offenders.push(`${f.path}: ${m[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("every PageHeader has a title", () => {
    const offenders: string[] = [];
    for (const f of APP_SRC) {
      if (f.path === HEADER) continue;
      for (const t of tagsOf(f.text, "PageHeader")) if (!/\btitle=/.test(t)) offenders.push(f.path);
    }
    expect(offenders).toEqual([]);
  });

  it("templates take typed slots: primary / more / filter / bulkEdit / back, never an actions node", () => {
    for (const p of ["list-page", "section-page", "form-page", "report-page", "detail-page"]) {
      const text = readFileSync(join(ROOT, `src/components/templates/${p}.tsx`), "utf8");
      expect(text, p).not.toMatch(/\bactions\??:\s*(React\.)?ReactNode/);
      expect(text, p).not.toMatch(/\boverflow\??:\s*OverflowAction/);
      expect(text, p).not.toMatch(/\bsubtitle\??:/);
    }
  });

  it("pages do not read the nav back target themselves: back is the bar's job", () => {
    const offenders = SRC.filter((f) => f.path !== HEADER && /\buseBackTarget\b/.test(f.text) && !f.path.startsWith("src/components/adaptive/") && !f.path.startsWith("src/lib/")).map((f) => f.path);
    expect(offenders).toEqual([]);
  });
});
