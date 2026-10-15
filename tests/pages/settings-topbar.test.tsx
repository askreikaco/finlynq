// Settings inner pages show the unified top bar on desktop (owner 2026-10-13: "why setting inner page missing topbar").
// Root cause: SectionPage capped its root (max-w-section, left-aligned, no mx-auto) but the PageHeader bleed
// (globals.css .page-header-bleed) assumes a CENTRED column, so the bar slid left under the rail and its back
// button and title were off-screen. Static checks: every page renders a template with a title, no template or shell
// caps/clips the root, and the settings shell never hides the header.
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const root = join(__dirname, "../..");
const read = (f: string) => readFileSync(join(root, f), "utf8");
const code = (f: string) => read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const PAGES = [
  "general", "display", "data", "developer", "integrations", "reconciliation", "rules",
  "import", "about", "bank-feeds", "backfill", "dropdown-order", "investments",
];

describe("settings inner pages render the page header", () => {
  for (const p of PAGES) {
    it(`/settings/${p} renders a template with a title (or re-exports one)`, () => {
      const f = `src/app/(app)/settings/${p}/page.tsx`;
      expect(existsSync(join(root, f)), f).toBe(true);
      const src = code(f);
      const reexport = src.match(/export \{ default \} from "\.\.\/([\w-]+)\/page"/);
      if (reexport) {
        const target = code(`src/app/(app)/settings/${reexport[1]}/page.tsx`);
        expect(target).toMatch(/<(SectionPage|FormPage|HubPage|DetailPage|ReportPage)\b/);
        expect(target).toMatch(/title=/);
      } else {
        expect(src).toMatch(/<(SectionPage|FormPage|HubPage|DetailPage|ReportPage)\b/);
        expect(src).toMatch(/title[=:]/);
      }
    });
  }

  it("/connect renders the integrations page inside the settings shell", () => {
    const src = code("src/app/(app)/connect/page.tsx");
    expect(src).toContain("SettingsShell");
    expect(src).toContain("settings/integrations/page");
  });

  it("the SectionPage template renders PageHeader with title, info and back", () => {
    const src = code("src/components/templates/section-page.tsx");
    expect(src).toMatch(/<PageHeader[\s\S]*title=\{title\}[\s\S]*info=\{info\}[\s\S]*back=\{back\}/);
  });
});

describe("nothing caps, clips or hides the header", () => {
  it("SectionPage and FormPage roots have no max-w cap (the bleed needs a full-width root)", () => {
    const sp = code("src/components/templates/section-page.tsx");
    const block = sp.slice(sp.indexOf("const WIDTH_CLASS"), sp.indexOf("const PAD_CLASS"));
    for (const k of ["section", "report", "form", "doc", "console"]) {
      expect(block, k).toMatch(new RegExp(`${k}:\\s*""`));
    }
    const fp = code("src/components/templates/form-page.tsx");
    const fblock = fp.slice(fp.indexOf("const WIDTH_CLASS"), fp.indexOf("const BODY_WIDTH_CLASS"));
    for (const k of ["form", "section", "report"]) expect(fblock, k).toMatch(new RegExp(`${k}:\\s*""`));
    expect(fp).toMatch(/cn\("w-full", WIDTH_CLASS\[width\]/);
  });

  it("DetailPage and the account shell roots are not capped or left-pinned", () => {
    for (const f of ["src/components/templates/detail-page.tsx", "src/components/account-shell.tsx", "src/components/settings/account-content.tsx"]) {
      const src = code(f);
      expect(src, f).not.toMatch(/max-w-(report|section|form|doc|console|2xl)\b/);
      expect(src, f).not.toMatch(/TW\.(section|report|doc|console)\b/);
    }
  });

  it("the settings shell neither hides nor clips the header, and adds no scroll container", () => {
    const shell = code("src/components/settings-shell.tsx");
    expect(shell).not.toMatch(/\bhidden\b|display:\s*none|overflow-(x-)?(hidden|auto|scroll)\b|max-w-/);
    // overflow-x-clip does not create a scroll container, so the sticky bar still pins to the page scroller.
    expect(shell).not.toMatch(/className="[^"]*overflow-/); // overflow-x-clip clipped the full-bleed bar to an inset
  });

  it("the header is sticky with no `hidden` on its bar", () => {
    const ph = code("src/components/mobile/page-header.tsx");
    expect(ph).toMatch(/PHONE_BAR =\s*"glass-bar sticky top-\[var\(--sat,0px\)\] z-30 page-header-bleed grid/);
    expect(ph).not.toMatch(/data-slot="page-header" className=\{cn\([^)]*hidden/);
  });

  it("settings pages do not wrap the header in a capped, non-centred element", () => {
    for (const p of ["general", "developer", "integrations", "reconciliation", "about"]) {
      const src = code(`src/app/(app)/settings/${p}/page.tsx`);
      expect(src, p).not.toMatch(/width="(form|section|doc|console)"/);
      expect(src, p).not.toMatch(/max-w-(report|section|form|doc|console|[2-7]?xl)\b/);
    }
  });
});
