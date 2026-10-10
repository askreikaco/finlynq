import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { NAV_REGISTRY } from "@/lib/nav-config";

/**
 * Pages where the title differs from the registry label.
 * These are documented with reasons.
 */
const TITLE_EXEMPTIONS: Record<string, string> = {
  "/dashboard": "Greeting page, no static title",
  "/account/info": "Tab-based layout, no literal title",
  "/account/security": "Tab-based layout, no literal title",
  "/transactions": "Dynamic transactions page",
  "/admin/env": "Group page, rendered by layout",
  "/settings": "Redirect to /settings/general",
  "/categories": "Feature-flagged: page.tsx delegates to _page-content.tsx (merged layout titles 'Categories' tabs)",
  "/dev/gallery": "Dev-only tool page; descriptive title 'Component Gallery'",
  "/portfolio/new": "Op-catalog chooser (buy, sell, deposit...); header 'New operation' is the catalog heading, registry label is the nav child name",
  "/account": "Redirects to /account/info (or AccountHub); the Account title comes from the AccountShell layout, not this page",
};

/**
 * Attribute text of the first <PageHeader ...> opening tag, or of the first page-template call (SectionPage,
 * ListPage, ...: the template renders the same PageHeader and passes its `title` through). Brace-aware:
 * `lead={<X />}` contains '>'.
 */
function pageHeaderAttrs(src: string): string | null {
  const m = src.match(/<(PageHeader|SectionPage|ListPage|FormPage|DetailPage|HubPage|ReportPage)[\s><]/);
  if (!m || m.index === undefined) return null;
  let from = m.index + m[0].length - 1;
  // Generic type arguments (`<ListPage<Goal>`) sit before the attributes: skip them.
  if (src[from] === "<") from = src.indexOf(">", from) + 1;
  let depth = 0;
  let i = from;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (depth === 0 && c === ">") break;
  }
  return src.slice(from, i);
}

/** Top-level (non-nested) attribute value: title="x", title='x' or title={expr}. */
function topLevelAttr(attrs: string, name: string): { kind: "str" | "expr"; value: string } | null {
  let depth = 0;
  for (let i = 0; i < attrs.length; i++) {
    const c = attrs[i];
    if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (depth === 0 && attrs.startsWith(name + "=", i) && /\s/.test(attrs[i - 1] ?? " ")) {
      const start = i + name.length + 1;
      const q = attrs[start];
      if (q === '"' || q === "'") {
        const end = attrs.indexOf(q, start + 1);
        return { kind: "str", value: attrs.slice(start + 1, end) };
      }
      if (q === "{") {
        let d = 0;
        let j = start;
        for (; j < attrs.length; j++) {
          if (attrs[j] === "{") d++;
          else if (attrs[j] === "}") {
            d--;
            if (d === 0) break;
          }
        }
        return { kind: "expr", value: attrs.slice(start + 1, j).trim() };
      }
    }
  }
  return null;
}

/** Text of a JSX title fragment: drop tags, keep the leading words before any nested expression. */
function fragmentText(expr: string): string {
  const inner = expr.replace(/^<>/, "").replace(/<\/>$/, "");
  const noTags = inner.replace(/<[^>]*\/>/g, "").replace(/<\/?[A-Za-z][^>]*>/g, "");
  return noTags.split("{")[0].trim();
}

function extractPageHeaderTitle(src: string): string | null {
  const attrs = pageHeaderAttrs(src);
  if (attrs === null) return null;
  const t = topLevelAttr(attrs, "title");
  if (!t) return null;
  if (t.kind === "str") return t.value;
  if (t.value.startsWith("<>")) return fragmentText(t.value) || null;
  if (t.value === "FAMILY_STRINGS.page_title") return "Family Wealth";
  const lit = t.value.match(/^(["'])(.*)\1$/);
  return lit ? lit[2] : null;
}

describe("Page titles", () => {
  it("every registry page has title matching label or documented exemption", () => {
    const failures: string[] = [];
    let titled = 0;

    for (const entry of NAV_REGISTRY) {
      // Skip query-string entries and mobile-only routes
      if (entry.path.includes("?") || entry.path === "/more") continue;

      // Try to find the page file
      const basePath = "src/app";
      const patterns = [
        join(process.cwd(), basePath, "(app)", entry.path, "page.tsx"),
        // Support admin/(env) pages
        join(process.cwd(), basePath, "(app)", "admin", "(env)", entry.path.replace("/admin/", ""), "page.tsx"),
      ];

      let pageContent: string | null = null;
      for (const pattern of patterns) {
        if (existsSync(pattern)) {
          pageContent = readFileSync(pattern, "utf-8");
          break;
        }
      }

      if (!pageContent) continue; // Page file doesn't exist, skip

      // Extract title from PageHeader component (attribute-aware: lead={<Icon/>} contains '>')
      let pageHeaderTitle: string | null = extractPageHeaderTitle(pageContent);

      // Match first h1 if no PageHeader found
      if (!pageHeaderTitle) {
        const h1Match = pageContent.match(/<h1[^>]*>([^<]+)<\/h1>/);
        if (h1Match) {
          pageHeaderTitle = h1Match[1].trim();
        }
      }

      // Server pages with no visible heading export their title as metadata
      if (!pageHeaderTitle) {
        const metaMatch = pageContent.match(/export\s+const\s+metadata\b[^=]*=\s*\{[^}]*?title:\s*"([^"]+)"/);
        if (metaMatch) {
          pageHeaderTitle = metaMatch[1];
        }
      }

      // If we found a title, check if it matches the label (unless exempted)
      if (pageHeaderTitle) {
        titled++;
        if (pageHeaderTitle !== entry.label && !TITLE_EXEMPTIONS[entry.path]) {
          failures.push(`${entry.path}: label="${entry.label}" but title="${pageHeaderTitle}"`);
        }
      } else if (!TITLE_EXEMPTIONS[entry.path]) {
        // No title found and not exempted - this is a failure
        failures.push(`${entry.path}: no extractable title (label="${entry.label}")`);
      }
    }

    console.log(`Titled entries extracted: ${titled}, Compared: ${Object.keys(TITLE_EXEMPTIONS).length + failures.length + titled - failures.length}`);
    expect(titled).toBeGreaterThanOrEqual(34);
    expect(failures).toEqual([]);
  });
});
