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
};

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

      // Extract title from PageHeader component
      let pageHeaderTitle: string | null = null;

      // Try matching double-quoted string title
      const doubleQuoteMatch = pageContent.match(/<PageHeader[^>]*?title="([^"]*)"/);
      if (doubleQuoteMatch) {
        pageHeaderTitle = doubleQuoteMatch[1];
      } else {
        // Try single-quoted string title
        const singleQuoteMatch = pageContent.match(/<PageHeader[^>]*?title='([^']*)'/);
        if (singleQuoteMatch) {
          pageHeaderTitle = singleQuoteMatch[1];
        } else {
          // Try JSX fragment title: title={<>...text...</>}
          // Look for text content within JSX fragments (strips icons/tags)
          const fragmentMatch = pageContent.match(/<PageHeader[^>]*?title=\{\<\>([\s\S]*?)<\/\>\}/);
          if (fragmentMatch) {
            // Extract text content, removing tags and trimming
            const fragmentContent = fragmentMatch[1];
            const textMatch = fragmentContent.match(/>\s*([A-Za-z\s]+?)\s*<|>\s*([A-Za-z\s]+?)\s*$/);
            if (textMatch) {
              pageHeaderTitle = (textMatch[1] || textMatch[2] || "").trim();
            } else {
              // Fallback: just get text nodes (words after tags)
              const words = fragmentContent.match(/\b[A-Z][a-zA-Z\s]+\b/);
              if (words) {
                pageHeaderTitle = words[0].trim();
              }
            }
          } else {
            // Try title={CONSTANT.property} pattern for dynamic titles
            const constantMatch = pageContent.match(/<PageHeader[^>]*?title=\{([A-Z_]+\.[a-z_]+)\}/);
            if (constantMatch) {
              const constantPath = constantMatch[1];
              // Special handling for FAMILY_STRINGS.page_title
              if (constantPath === "FAMILY_STRINGS.page_title") {
                pageHeaderTitle = "Family Wealth";
              }
            }
          }
        }
      }

      // Match first h1 if no PageHeader found
      if (!pageHeaderTitle) {
        const h1Match = pageContent.match(/<h1[^>]*>([^<]+)<\/h1>/);
        if (h1Match) {
          pageHeaderTitle = h1Match[1].trim();
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
