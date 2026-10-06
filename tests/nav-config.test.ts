import { describe, it, expect } from "vitest";
import {
  NAV_REGISTRY,
  ALIASES,
  getNavEntry,
  getEntriesBySurface,
  getEntriesByGroup,
  isRegisteredPath,
} from "@/lib/nav-config";
import { readdirSync } from "fs";
import { join } from "path";
import * as lucideIcons from "lucide-react";

/**
 * Derive the list of authenticated page files from src/app/(app)/[glob]/page.tsx
 * Normalizes route group paths like /(env)/ to their actual URL paths.
 */
function getAuthenticatedPagePaths(): string[] {
  const appDir = join(process.cwd(), "src/app/(app)");

  function walkDir(dir: string, basePath = ""): string[] {
    const paths: string[] = [];
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const routePath = basePath + "/" + entry.name;

      if (entry.isDirectory()) {
        // Skip special directories like [id] and _components
        if (!entry.name.startsWith("[") && !entry.name.startsWith("_")) {
          paths.push(...walkDir(fullPath, routePath));
        }
      } else if (entry.name === "page.tsx") {
        // Extract the route path
        paths.push(routePath);
      }
    }

    return paths;
  }

  const pagePaths = walkDir(appDir);

  // Convert file paths to route paths
  // Also remove Next.js route groups like /(env)/ from the paths
  return pagePaths
    .map((p) => p.replace(/\/page\.tsx$/, ""))
    .map((p) => p.replace(/\/\([^)]+\)/g, "")) // Remove route groups like /(env)
    .filter((p) => p && p !== "/");
}

describe("nav-config", () => {
  describe("Registry structure", () => {
    it("should have unique ids", () => {
      const ids = NAV_REGISTRY.map((e) => e.id);
      const uniqueIds = new Set(ids);
      expect(ids.length).toBe(uniqueIds.size);
    });

    it("should have unique paths (except query-string entries)", () => {
      const paths = NAV_REGISTRY.map((e) => e.path).filter((p) => !p.includes("?"));
      const uniquePaths = new Set(paths);
      expect(paths.length).toBe(uniquePaths.size);
    });

    it("should have valid mode values", () => {
      for (const entry of NAV_REGISTRY) {
        expect(["prod", "dev"]).toContain(entry.mode);
      }
    });

    it("should have valid surface values", () => {
      const validSurfaces = [
        "sidebar",
        "mobileBar",
        "more",
        "settings",
        "admin",
        "account",
      ];
      for (const entry of NAV_REGISTRY) {
        for (const surface of entry.surfaces) {
          expect(validSurfaces).toContain(surface);
        }
      }
    });

    it("should have valid flag values if present", () => {
      for (const entry of NAV_REGISTRY) {
        if (entry.flag) {
          expect(["family", "announcements", "feedback"]).toContain(entry.flag);
        }
      }
    });
  });

  describe("Label uniqueness", () => {
    it("should not have duplicate labels within the same surface", () => {
      const surfaces = [
        "sidebar",
        "mobileBar",
        "more",
        "settings",
        "admin",
        "account",
      ] as const;

      for (const surface of surfaces) {
        const entries = getEntriesBySurface(surface);
        const labels = entries.map((e) => e.label);
        const uniqueLabels = new Set(labels);

        expect(labels.length).toBe(uniqueLabels.size);
      }
    });

    it("should not map same label to different paths within the same surface", () => {
      // Check per-surface label uniqueness
      const surfaces = [
        "sidebar",
        "mobileBar",
        "more",
        "settings",
        "admin",
        "account",
      ] as const;

      for (const surface of surfaces) {
        const labelToPaths: Record<string, Set<string>> = {};

        const entries = NAV_REGISTRY.filter((e) => e.surfaces.includes(surface));
        for (const entry of entries) {
          const basePath = entry.path.split("?")[0]; // remove query params
          if (!labelToPaths[entry.label]) {
            labelToPaths[entry.label] = new Set();
          }
          labelToPaths[entry.label].add(basePath);
        }

        for (const [_label, paths] of Object.entries(labelToPaths)) {
          expect(paths.size).toBe(1);
        }
      }
    });
  });

  describe("Page coverage", () => {
    it("should have main authenticated pages in registry or aliases", () => {
      const pagePaths = getAuthenticatedPagePaths();
      const registeredPaths = new Set<string>();

      // Add direct registry entries
      for (const entry of NAV_REGISTRY) {
        const basePath = entry.path.split("?")[0]; // remove query params
        registeredPaths.add(basePath);
      }

      // Add aliased paths
      for (const alias of ALIASES) {
        registeredPaths.add(alias.path);
      }

      // Add known detail/dynamic routes that don't need registry entries
      const detailRoutes = new Set([
        "/account", // parent for /account/info and /account/security
        "/portfolio/dividends",
        "/portfolio/realized-gains",
        "/portfolio/new",
        "/family/accept",
        "/family/share",
        "/transactions/audit",
        "/transactions/new",
        "/transactions/search",
        "/settings/account", // not in nav, account is separate
        "/settings/backfill",
        "/settings/import/reconcile-visibility",
        "/import/pending", // live route, not redirected
        "/manage-accounts",
        "/more", // mobile-only route
      ]);

      const missing = pagePaths.filter(
        (p) =>
          !registeredPaths.has(p) &&
          !detailRoutes.has(p)
      );

      // Most pages should be covered
      expect(missing.length).toBe(0);
    });
  });

  describe("Functions", () => {
    it("should find entries by path", () => {
      const entry = getNavEntry("/dashboard");
      expect(entry).toBeDefined();
      expect(entry?.label).toBe("Home");
    });

    it("should return undefined for unknown paths", () => {
      const entry = getNavEntry("/unknown");
      expect(entry).toBeUndefined();
    });

    it("should get entries by surface", () => {
      const sidebarEntries = getEntriesBySurface("sidebar");
      expect(sidebarEntries.length).toBeGreaterThan(0);
      expect(sidebarEntries.every((e) => e.surfaces.includes("sidebar"))).toBe(
        true
      );
    });

    it("should get entries by group", () => {
      const trackingEntries = getEntriesByGroup("Tracking");
      expect(trackingEntries.length).toBeGreaterThan(0);
      expect(trackingEntries.every((e) => e.group === "Tracking")).toBe(true);
    });

    it("should check if path is registered", () => {
      expect(isRegisteredPath("/dashboard")).toBe(true);
      expect(isRegisteredPath("/settings/general")).toBe(true);
      expect(isRegisteredPath("/settings/display")).toBe(true); // alias
      expect(isRegisteredPath("/unknown")).toBe(false);
    });
  });

  describe("Label fixes", () => {
    it("should have 'Home' for /dashboard everywhere", () => {
      const entry = getNavEntry("/dashboard");
      expect(entry?.label).toBe("Home");
    });

    it("should have 'Spending by category' for /categories", () => {
      const entry = getNavEntry("/categories");
      expect(entry?.label).toBe("Spending by category");
    });

    it("should have 'Categories' for /settings/categorization", () => {
      const entry = getNavEntry("/settings/categorization");
      expect(entry?.label).toBe("Categories");
    });

    it("should have 'Reconciliation' for /settings/reconciliation", () => {
      const entry = getNavEntry("/settings/reconciliation");
      expect(entry?.label).toBe("Reconciliation");
    });

    it("should have 'Reconcile' for /import?tab=reconcile", () => {
      const entry = getNavEntry("/import?tab=reconcile");
      expect(entry?.label).toBe("Reconcile");
    });

    it("should have 'What's new' (sentence case) everywhere", () => {
      const entry = getNavEntry("/whats-new");
      expect(entry?.label).toBe("What's new");
    });

    it("should have 'Feedback' for /feedback (user)", () => {
      const entry = getNavEntry("/feedback");
      expect(entry?.label).toBe("Feedback");
    });

    it("should have 'User feedback' for /admin/feedback", () => {
      const entry = getNavEntry("/admin/feedback");
      expect(entry?.label).toBe("User feedback");
    });
  });


  describe("Aliases", () => {
    it("should have valid alias entries", () => {
      for (const alias of ALIASES) {
        expect(alias.path).toBeDefined();
        expect(alias.kind).toBeDefined();
        expect(["redirect", "render-parent"]).toContain(alias.kind);
        expect(alias.target).toBeDefined();
      }
    });

    it("should have /settings/display as an alias", () => {
      const alias = ALIASES.find((a) => a.path === "/settings/display");
      expect(alias).toBeDefined();
      expect(alias?.kind).toBe("render-parent");
    });

    it("should have /settings/rules as an alias", () => {
      const alias = ALIASES.find((a) => a.path === "/settings/rules");
      expect(alias).toBeDefined();
      expect(alias?.kind).toBe("render-parent");
    });

    it("should have correct complete ALIASES array with all entries in order", () => {
      const expectedAliases = [
        { path: "/settings/display", kind: "render-parent", target: "/settings/general" },
        { path: "/settings/dropdown-order", kind: "render-parent", target: "/settings/general" },
        { path: "/settings/data", kind: "render-parent", target: "/settings/developer" },
        { path: "/settings/bank-feeds", kind: "render-parent", target: "/settings/integrations" },
        { path: "/settings/securities", kind: "render-parent", target: "/settings/investments" },
        { path: "/settings/holding-accounts", kind: "render-parent", target: "/settings/investments" },
        { path: "/settings/rules", kind: "render-parent", target: "/settings/reconciliation" },
        { path: "/settings/import", kind: "render-parent", target: "/settings/reconciliation" },
        { path: "/connect", kind: "render-parent", target: "/settings/integrations" },
      ];
      expect(ALIASES).toEqual(expectedAliases);
    });
  });

  describe("Admin-only pages", () => {
    it("should have adminOnly flag on admin routes", () => {
      const adminEntries = getEntriesByGroup("Admin");
      expect(adminEntries.every((e) => e.adminOnly === true)).toBe(true);
    });
  });

  describe("Feature flags", () => {
    it("should have family flag on /family", () => {
      const entry = getNavEntry("/family");
      expect(entry?.flag).toBe("family");
    });

    it("should have announcements flag on /whats-new", () => {
      const entry = getNavEntry("/whats-new");
      expect(entry?.flag).toBe("announcements");
    });

    it("should have feedback flag on /feedback", () => {
      const entry = getNavEntry("/feedback");
      expect(entry?.flag).toBe("feedback");
    });
  });

  describe("Icons", () => {
    it("every entry should have a valid icon", () => {
      for (const entry of NAV_REGISTRY) {
        expect(entry.icon).toBeDefined();
        // Icon should be a React component (function or ForwardRef object)
        expect(entry.icon).not.toBeNull();
      }
    });

    it("should have Settings2 for /settings/general", () => {
      const entry = getNavEntry("/settings/general");
      expect(entry?.icon).toBe(lucideIcons.Settings2);
    });

    it("should have correct admin environment icons", () => {
      const adminSystemEntry = getNavEntry("/admin/system");
      expect(adminSystemEntry?.icon).toBe(lucideIcons.Server);

      const adminDiagnosticsEntry = getNavEntry("/admin/diagnostics");
      expect(adminDiagnosticsEntry?.icon).toBe(lucideIcons.ScrollText);

      const adminApiLogEntry = getNavEntry("/admin/api-log");
      expect(adminApiLogEntry?.icon).toBe(lucideIcons.Activity);

      const adminPriceCacheEntry = getNavEntry("/admin/price-cache");
      expect(adminPriceCacheEntry?.icon).toBe(lucideIcons.Database);

      const adminIntegrationsEntry = getNavEntry("/admin/integrations");
      expect(adminIntegrationsEntry?.icon).toBe(lucideIcons.Plug);
    });

    it("should have correct account surface icons", () => {
      const accountInfoEntry = getNavEntry("/account/info");
      expect(accountInfoEntry?.icon).toBe(lucideIcons.Settings);

      const accountSecurityEntry = getNavEntry("/account/security");
      expect(accountSecurityEntry?.icon).toBe(lucideIcons.ShieldCheck);
    });

    it("all sidebar entries should have correct icons", () => {
      const sidebarIconMap: Record<string, typeof lucideIcons[keyof typeof lucideIcons]> = {
        "/dashboard": lucideIcons.LayoutDashboard,
        "/whats-new": lucideIcons.Megaphone,
        "/chat": lucideIcons.MessageSquare,
        "/transactions": lucideIcons.ArrowLeftRight,
        "/budgets": lucideIcons.PiggyBank,
        "/goals": lucideIcons.Target,
        "/subscriptions": lucideIcons.CreditCard,
        "/accounts": lucideIcons.Wallet,
        "/portfolio": lucideIcons.TrendingUp,
        "/loans": lucideIcons.Landmark,
        "/family": lucideIcons.Users,
        "/reports": lucideIcons.FileText,
        "/categories": lucideIcons.ChartPie,
        "/tax": lucideIcons.Calculator,
        "/scenarios": lucideIcons.GitBranch,
        "/fire": lucideIcons.FlameKindling,
        "/import": lucideIcons.Upload,
        "/api-docs": lucideIcons.FileText,
        "/feedback": lucideIcons.MessageCircle,
        "/settings": lucideIcons.Settings,
        "/admin": lucideIcons.ShieldCheck,
        "/admin/inbox": lucideIcons.Inbox,
        "/admin/announcements": lucideIcons.Megaphone,
        "/admin/email-inbox": lucideIcons.Mailbox,
        "/admin/env": lucideIcons.Server,
        "/admin/feedback": lucideIcons.MessageCircle,
      };

      for (const [path, expectedIcon] of Object.entries(sidebarIconMap)) {
        const entry = getNavEntry(path);
        expect(entry?.icon).toBe(expectedIcon);
      }
    });

    it("all more menu entries should have correct icons", () => {
      const moreIconMap: Record<string, typeof lucideIcons[keyof typeof lucideIcons]> = {
        "/dashboard": lucideIcons.LayoutDashboard,
        "/whats-new": lucideIcons.Megaphone,
        "/chat": lucideIcons.MessageSquare,
        "/transactions": lucideIcons.ArrowLeftRight,
        "/budgets": lucideIcons.PiggyBank,
        "/goals": lucideIcons.Target,
        "/subscriptions": lucideIcons.CreditCard,
        "/accounts": lucideIcons.Wallet,
        "/portfolio": lucideIcons.TrendingUp,
        "/loans": lucideIcons.Landmark,
        "/family": lucideIcons.Users,
        "/fire": lucideIcons.FlameKindling,
        "/import": lucideIcons.Upload,
        "/import?tab=reconcile": lucideIcons.Inbox,
        "/reports": lucideIcons.FileText,
        "/categories": lucideIcons.ChartPie,
        "/tax": lucideIcons.Calculator,
        "/scenarios": lucideIcons.GitBranch,
        "/api-docs": lucideIcons.FileText,
        "/settings": lucideIcons.Settings,
        "/settings/categorization": lucideIcons.Tag,
        "/admin": lucideIcons.ShieldCheck,
        "/admin/inbox": lucideIcons.Inbox,
        "/admin/announcements": lucideIcons.Megaphone,
        "/admin/email-inbox": lucideIcons.Mailbox,
        "/admin/env": lucideIcons.Server,
        "/admin/feedback": lucideIcons.MessageCircle,
      };

      for (const [path, expectedIcon] of Object.entries(moreIconMap)) {
        const entry = getNavEntry(path);
        expect(entry?.icon).toBe(expectedIcon);
      }
    });
  });

  describe("Registry entries resolve to real pages", () => {
    it("every registry entry (except parent-only entries) should have a page file", () => {
      const appDir = join(process.cwd(), "src/app/(app)");

      // Get all page files in the app directory
      function getAllPageFiles(): Set<string> {
        const pages = new Set<string>();

        function walkDir(dir: string, basePath = ""): void {
          const entries = readdirSync(dir, { withFileTypes: true });

          for (const entry of entries) {
            const fullPath = join(dir, entry.name);
            const routePath = basePath + "/" + entry.name;

            if (entry.isDirectory() && !entry.name.startsWith("_")) {
              walkDir(fullPath, routePath);
            } else if (entry.name === "page.tsx") {
              const normalizedPath = routePath
                .replace(/\/page\.tsx$/, "") // Remove /page.tsx
                .replace(/\/\([^)]+\)/g, "") // Remove route groups like /(env)
                .replace(/\/$/, ""); // Remove trailing slash
              pages.add(normalizedPath);
            }
          }
        }

        walkDir(appDir);
        return pages;
      }

      const pageFiles = getAllPageFiles();

      for (const entry of NAV_REGISTRY) {
        // Skip entries with query params
        if (entry.path.includes("?")) continue;

        const basePath = entry.path.split("?")[0];
        const exists = pageFiles.has(basePath);

        expect(exists).toBe(true);
      }
    });
  });

  describe("More menu", () => {
    it("should have whats-new with announcements flag in more surface for badge rendering", () => {
      const entry = getNavEntry("/whats-new");
      expect(entry?.flag).toBe("announcements");
      expect(entry?.surfaces).toContain("more");
    });

    it("should have feedback entry with feedback flag in sidebar", () => {
      const entry = getNavEntry("/feedback");
      expect(entry?.flag).toBe("feedback");
      expect(entry?.surfaces).toContain("sidebar");
    });
  });

  describe("Account surface", () => {
    it("should have info and security tabs in account surface", () => {
      const accountEntries = getEntriesBySurface("account");
      const paths = accountEntries.map((e) => e.path);
      expect(paths).toContain("/account/info");
      expect(paths).toContain("/account/security");
    });

    it("should have parent set for account children", () => {
      const infoEntry = getNavEntry("/account/info");
      const securityEntry = getNavEntry("/account/security");
      expect(infoEntry?.parent).toBe("/account");
      expect(securityEntry?.parent).toBe("/account");
    });
  });

  describe("Admin environment pages", () => {
    it("should have System, Diagnostics, API Log, Price Cache, Integrations in admin environment", () => {
      const adminEnvEntries = NAV_REGISTRY.filter(
        (e) => e.surfaces.includes("admin") && e.parent === "/admin/env"
      );
      const labels = adminEnvEntries.map((e) => e.label);
      expect(labels).toContain("System");
      expect(labels).toContain("Diagnostics");
      expect(labels).toContain("API Log");
      expect(labels).toContain("Rate Cache");
      expect(labels).toContain("Integrations");
    });

    it("should have correct paths for admin environment pages", () => {
      expect(getNavEntry("/admin/system")).toBeDefined();
      expect(getNavEntry("/admin/diagnostics")).toBeDefined();
      expect(getNavEntry("/admin/api-log")).toBeDefined();
      expect(getNavEntry("/admin/price-cache")).toBeDefined();
      expect(getNavEntry("/admin/integrations")).toBeDefined();
    });
  });

  describe("Dev gallery", () => {
    it("getNavEntry('/dev/gallery') has mode === 'dev'", () => {
      const entry = getNavEntry("/dev/gallery");
      expect(entry).toBeDefined();
      expect(entry?.mode).toBe("dev");
    });

    it("getNavEntry('/dev/gallery') has adminOnly unset", () => {
      const entry = getNavEntry("/dev/gallery");
      expect(entry?.adminOnly).toBeUndefined();
    });

    it("getNavEntry('/dev/gallery') has surfaces exactly ['sidebar','more']", () => {
      const entry = getNavEntry("/dev/gallery");
      expect(entry?.surfaces).toEqual(["sidebar", "more"]);
    });
  });
});
