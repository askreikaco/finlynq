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
  "/accounts": "Dynamic page, title set per account",
  "/account/info": "Tab-based layout, no literal title",
  "/account/security": "Tab-based layout, no literal title",
  "/portfolio": "Dynamic portfolio page",
  "/transactions": "Dynamic transactions page",
  "/admin": "Dashboard page, no literal title",
  "/admin/env": "Group page, rendered by layout",
  "/admin/inbox": "Dynamic email inbox view",
  "/budgets": "Dynamic budget page",
  "/categories": "Dynamic category page",
  "/family": "Dynamic family page",
  "/goals": "Dynamic goals page",
  "/loans": "Dynamic loans page",
  "/feedback": "Dynamic feedback page",
  "/settings": "Redirect to /settings/general",
  "/settings/investments": "Dynamic investments page",
  "/subscriptions": "Dynamic subscriptions page",
};

describe("Page titles", () => {
  it("every registry page has title matching label or documented exemption", () => {
    const failures: string[] = [];

    for (const entry of NAV_REGISTRY) {
      // Skip query-string entries and mobile-only routes
      if (entry.path.includes("?") || entry.path === "/more") continue;

      // Skip exempted entries
      if (TITLE_EXEMPTIONS[entry.path]) continue;

      // Try to find the page file
      const basePath = "src/app";
      const patterns = [
        join(process.cwd(), basePath, "(app)", entry.path, "page.tsx"),
      ];

      let pageContent: string | null = null;
      for (const pattern of patterns) {
        if (existsSync(pattern)) {
          pageContent = readFileSync(pattern, "utf-8");
          break;
        }
      }

      if (!pageContent) continue; // Page file doesn't exist, skip

      // Extract title from PageHeader or h1
      // Match title="..." or title='...' (handle apostrophes in titles)
      const pageHeaderMatch = pageContent.match(/title="([^"]*)"|title='([^']*)'/);
      const h1Match = pageContent.match(/<h1[^>]*>([^<]+)<\/h1>/);

      let foundTitle: string | null = null;
      if (pageHeaderMatch) {
        foundTitle = pageHeaderMatch[1] || pageHeaderMatch[2];
      } else if (h1Match) {
        foundTitle = h1Match[1].trim();
      }

      if (foundTitle && foundTitle !== entry.label) {
        failures.push(`${entry.path}: label="${entry.label}" but title="${foundTitle}"`);
      }
    }

    expect(failures).toEqual([]);
  });
});
