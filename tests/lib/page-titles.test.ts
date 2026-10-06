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
  "/admin": "Dashboard page, no literal title",
  "/admin/env": "Group page, rendered by layout",
  "/settings": "Redirect to /settings/general",
  "/fire": "Dynamic page with no static title",
};

describe("Page titles", () => {
  it("every registry page has title matching label or documented exemption", () => {
    const failures: string[] = [];
    let entriesCompared = 0;

    for (const entry of NAV_REGISTRY) {
      // Skip query-string entries and mobile-only routes
      if (entry.path.includes("?") || entry.path === "/more") continue;

      // Skip exempted entries
      if (TITLE_EXEMPTIONS[entry.path]) continue;

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

      entriesCompared++;

      // Extract title from PageHeader component only (not ErrorState or other title= attributes)
      // Match <PageHeader ... title="exact string" ... /> - use non-greedy matching
      let pageHeaderTitle: string | null = null;

      // Try matching double-quoted title first (non-greedy [^>]*?)
      const doubleQuoteMatch = pageContent.match(/<PageHeader[^>]*?title="([^"]*)"/);
      if (doubleQuoteMatch) {
        pageHeaderTitle = doubleQuoteMatch[1];
      } else {
        // Try single-quoted title
        const singleQuoteMatch = pageContent.match(/<PageHeader[^>]*?title='([^']*)'/);
        if (singleQuoteMatch) {
          pageHeaderTitle = singleQuoteMatch[1];
        }
      }

      // Match first h1 if no PageHeader found
      const h1Match = pageContent.match(/<h1[^>]*>([^<]+)<\/h1>/);

      const foundTitle: string | null = pageHeaderTitle || (h1Match ? h1Match[1].trim() : null);

      if (foundTitle && foundTitle !== entry.label) {
        failures.push(`${entry.path}: label="${entry.label}" but title="${foundTitle}"${!pageHeaderTitle && h1Match ? " (h1)" : ""}`);
      }
    }

    console.log(`Compared ${entriesCompared} registry entries`);
    expect(failures).toEqual([]);
  });
});
