/**
 * Navigation Registry — Single source of truth for all authenticated navigation.
 *
 * Every authenticated page route gets exactly one entry with:
 * - id: unique identifier
 * - path: the route path
 * - label: canonical label (one per page across all surfaces)
 * - icon: lucide-react icon
 * - group: logical grouping (for sidebar sections)
 * - parent?: parent path for detail pages
 * - mode: 'prod' or 'dev'
 * - adminOnly?: true if only admins see this
 * - flag?: 'family' | 'announcements' for conditional visibility
 * - surfaces: where this page appears (sidebar, mobileBar, more, settings, admin, account)
 *
 * Also includes:
 * - aliases: old paths that redirect or render parent (for legacy pages)
 * - redirects: paths that should redirect to canonical paths with query preservation
 */

import {
  LayoutDashboard,
  Wallet,
  ArrowLeftRight,
  PiggyBank,
  TrendingUp,
  Landmark,
  Target,
  FileText,
  Calculator,
  Upload,
  Settings,
  Settings2,
  CreditCard,
  ChartPie,
  FlameKindling,
  GitBranch,
  MessageSquare,
  Megaphone,
  ShieldCheck,
  Inbox,
  Mailbox,
  MessageCircle,
  Server,
  Users,
  Tag,
  Briefcase,
  Wrench,
  Link2,
  Info,
  ScrollText,
  Activity,
  Database,
  Plug,
  Cloud,
  MoreHorizontal,
  type LucideIcon,
} from "lucide-react";

export type Surface = "sidebar" | "mobileBar" | "more" | "settings" | "admin" | "account";
export type Flag = "family" | "announcements" | "feedback" | "instance";
export type Mode = "prod" | "dev";

export interface NavPageEntry {
  id: string;
  path: string;
  label: string;
  icon: LucideIcon;
  group: string; // "Top", "Tracking", "Wealth", "Analysis", "Planning", "Tools", "Admin", etc.
  parent?: string; // for detail pages like /accounts/[id]
  mode: Mode;
  adminOnly?: boolean;
  flag?: Flag; // requires feature flag to be true
  surfaces: Surface[];
  activePrefixes?: string[]; // for parent routes that should highlight child paths
  tab?: { order: number }; // mobileBar tab ordering
}

export interface AliasEntry {
  path: string;
  kind: "redirect" | "render-parent"; // redirect: old path -> new; render-parent: old page renders parent
  target: string; // canonical path or parent path
}


export const NAV_REGISTRY: NavPageEntry[] = [
  // Top section
  {
    id: "dashboard",
    path: "/dashboard",
    label: "Home",
    icon: LayoutDashboard,
    group: "Top",
    mode: "prod",
    surfaces: ["sidebar", "mobileBar", "more"],
    tab: { order: 1 },
  },
  {
    id: "whats-new",
    path: "/whats-new",
    parent: "/more",
    label: "What's new",
    icon: Megaphone,
    group: "Top",
    mode: "prod",
    flag: "announcements",
    surfaces: ["sidebar", "more"],
  },
  {
    id: "chat",
    path: "/chat",
    parent: "/more",
    label: "AI Chat",
    icon: MessageSquare,
    group: "Top",
    mode: "dev",
    surfaces: ["sidebar", "more"],
  },

  // Tracking section
  {
    id: "transactions",
    path: "/transactions",
    label: "Transactions",
    icon: ArrowLeftRight,
    group: "Tracking",
    mode: "prod",
    surfaces: ["sidebar", "mobileBar", "more"],
    tab: { order: 4 },
  },
  {
    id: "budgets",
    path: "/budgets",
    parent: "/more",
    label: "Budgets",
    icon: PiggyBank,
    group: "Tracking",
    mode: "prod",
    surfaces: ["sidebar", "more"],
  },
  {
    id: "goals",
    path: "/goals",
    parent: "/more",
    label: "Goals",
    icon: Target,
    group: "Tracking",
    mode: "prod",
    surfaces: ["sidebar", "more"],
  },
  {
    id: "subscriptions",
    path: "/subscriptions",
    parent: "/more",
    label: "Subscriptions",
    icon: CreditCard,
    group: "Tracking",
    mode: "prod",
    surfaces: ["sidebar", "more"],
  },

  // Wealth section
  {
    id: "accounts",
    path: "/accounts",
    label: "Accounts",
    icon: Wallet,
    group: "Wealth",
    mode: "prod",
    surfaces: ["sidebar", "mobileBar", "more"],
    tab: { order: 2 },
  },
  {
    id: "portfolio",
    path: "/portfolio",
    label: "Portfolio",
    icon: TrendingUp,
    group: "Wealth",
    mode: "prod",
    surfaces: ["sidebar", "mobileBar", "more"],
    activePrefixes: ["/portfolio", "/portfolio/dividends", "/portfolio/realized-gains"],
    tab: { order: 3 },
  },
  {
    id: "loans",
    path: "/loans",
    parent: "/more",
    label: "Loans & Debt",
    icon: Landmark,
    group: "Wealth",
    mode: "prod",
    surfaces: ["sidebar", "more"],
  },
  {
    id: "family",
    path: "/family",
    parent: "/more",
    label: "Family Wealth",
    icon: Users,
    group: "Wealth",
    mode: "prod",
    flag: "family",
    surfaces: ["sidebar", "more"],
    activePrefixes: ["/family"],
  },

  // Analysis section
  {
    id: "reports",
    path: "/reports",
    parent: "/more",
    label: "Reports",
    icon: FileText,
    group: "Analysis",
    mode: "prod",
    surfaces: ["sidebar", "more"],
  },
  {
    id: "categories",
    path: "/categories",
    parent: "/more",
    label: "Spending by category",
    icon: ChartPie,
    group: "Analysis",
    mode: "prod",
    surfaces: ["sidebar", "more"],
  },
  {
    id: "tax",
    path: "/tax",
    parent: "/more",
    label: "Tax",
    icon: Calculator,
    group: "Analysis",
    mode: "dev",
    surfaces: ["sidebar", "more"],
  },

  // Planning section
  {
    id: "scenarios",
    path: "/scenarios",
    parent: "/more",
    label: "Scenarios",
    icon: GitBranch,
    group: "Planning",
    mode: "dev",
    surfaces: ["sidebar", "more"],
  },
  {
    id: "fire",
    path: "/fire",
    parent: "/more",
    label: "FIRE Calculator",
    icon: FlameKindling,
    group: "Planning",
    mode: "dev",
    surfaces: ["sidebar", "more"],
  },

  // Tools section
  {
    id: "import",
    path: "/import",
    parent: "/more",
    label: "Import",
    icon: Upload,
    group: "Tools",
    mode: "prod",
    surfaces: ["sidebar", "more"],
    activePrefixes: ["/import"],
  },
  {
    id: "api-docs",
    path: "/api-docs",
    parent: "/more",
    label: "API Docs",
    icon: FileText,
    group: "Tools",
    mode: "dev",
    surfaces: ["sidebar", "more"],
  },
  {
    id: "feedback",
    path: "/feedback",
    parent: "/more",
    label: "Feedback",
    icon: MessageCircle,
    group: "Tools",
    mode: "prod",
    flag: "feedback",
    surfaces: ["sidebar", "more"],
  },
  {
    id: "settings",
    path: "/settings",
    parent: "/more",
    label: "Settings",
    icon: Settings,
    group: "Tools",
    mode: "prod",
    surfaces: ["sidebar", "more"],
    activePrefixes: ["/settings"],
  },

  // Non-surface parents: the More screen, the account hub and the portfolio create flow.
  // They have no nav surface; they exist so useBackTarget() can resolve their children.
  {
    id: "more",
    path: "/more",
    label: "More",
    icon: MoreHorizontal,
    group: "Top",
    mode: "prod",
    surfaces: [],
  },
  {
    id: "portfolio-new",
    path: "/portfolio/new",
    label: "New position",
    icon: TrendingUp,
    group: "Wealth",
    mode: "prod",
    surfaces: [],
    parent: "/portfolio",
  },
  {
    id: "manage-accounts",
    path: "/manage-accounts",
    label: "Manage accounts",
    icon: Wallet,
    group: "Account",
    mode: "prod",
    surfaces: [],
    parent: "/more",
  },
  {
    id: "account",
    path: "/account",
    label: "Account",
    icon: Settings,
    group: "Account",
    mode: "prod",
    surfaces: [],
    parent: "/more",
  },

  // Settings subsections (in settings shell)
  {
    id: "settings-general",
    path: "/settings/general",
    label: "General",
    icon: Settings2,
    group: "Settings",
    mode: "prod",
    surfaces: ["settings"],
    parent: "/settings",
  },
  {
    id: "settings-categorization",
    path: "/settings/categorization",
    label: "Categories",
    icon: Tag,
    group: "Settings",
    mode: "prod",
    surfaces: ["settings", "more"],
    parent: "/settings",
  },
  {
    id: "settings-reconciliation",
    path: "/settings/reconciliation",
    label: "Reconciliation",
    icon: Link2,
    group: "Settings",
    mode: "prod",
    surfaces: ["settings"],
    parent: "/settings",
  },
  {
    id: "settings-investments",
    path: "/settings/investments",
    label: "Investments",
    icon: Briefcase,
    group: "Settings",
    mode: "prod",
    surfaces: ["settings"],
    parent: "/settings",
  },
  {
    id: "settings-integrations",
    path: "/settings/integrations",
    label: "Integrations",
    icon: Server,
    group: "Settings",
    mode: "prod",
    surfaces: ["settings"],
    parent: "/settings",
  },
  {
    id: "settings-developer",
    path: "/settings/developer",
    label: "Developer",
    icon: Wrench,
    group: "Settings",
    mode: "prod",
    surfaces: ["settings"],
    parent: "/settings",
  },
  {
    id: "settings-about",
    path: "/settings/about",
    label: "About",
    icon: Info,
    group: "Settings",
    mode: "prod",
    surfaces: ["settings"],
    parent: "/settings",
  },

  // Account subsections (in account layout)
  {
    id: "account-info",
    path: "/account/info",
    label: "Info",
    icon: Settings,
    group: "Account",
    mode: "prod",
    surfaces: ["account"],
    parent: "/account",
  },
  {
    id: "account-security",
    path: "/account/security",
    label: "Security",
    icon: ShieldCheck,
    group: "Account",
    mode: "prod",
    surfaces: ["account"],
    parent: "/account",
  },

  // Admin section
  {
    id: "admin",
    path: "/admin",
    parent: "/more",
    label: "Admin",
    icon: ShieldCheck,
    group: "Admin",
    mode: "prod",
    adminOnly: true,
    surfaces: ["sidebar", "more"],
  },
  {
    id: "admin-inbox",
    path: "/admin/inbox",
    parent: "/more",
    label: "Admin Inbox",
    icon: Inbox,
    group: "Admin",
    mode: "prod",
    adminOnly: true,
    surfaces: ["sidebar", "more"],
  },
  {
    id: "admin-email-inbox",
    path: "/admin/email-inbox",
    parent: "/more",
    label: "Email Oversight",
    icon: Mailbox,
    group: "Admin",
    mode: "prod",
    adminOnly: true,
    surfaces: ["sidebar", "more"],
  },
  {
    id: "admin-env",
    path: "/admin/env",
    parent: "/more",
    label: "Environment",
    icon: Server,
    group: "Admin",
    mode: "prod",
    adminOnly: true,
    surfaces: ["sidebar", "more"],
    activePrefixes: [
      "/admin/system",
      "/admin/diagnostics",
      "/admin/api-log",
      "/admin/price-cache",
      "/admin/integrations",
      "/admin/env",
    ],
  },
  {
    id: "admin-announcements",
    path: "/admin/announcements",
    parent: "/more",
    label: "Announcements",
    icon: Megaphone,
    group: "Admin",
    mode: "prod",
    adminOnly: true,
    surfaces: ["sidebar", "more"],
  },
  {
    id: "admin-feedback",
    path: "/admin/feedback",
    parent: "/more",
    label: "User feedback",
    icon: MessageCircle,
    group: "Admin",
    mode: "prod",
    adminOnly: true,
    surfaces: ["sidebar", "more"],
  },
  {
    id: "admin-instance",
    path: "/admin/instance",
    parent: "/more",
    label: "Instance config",
    icon: Cloud,
    group: "Admin",
    mode: "prod",
    adminOnly: true,
    flag: "instance",
    surfaces: ["sidebar", "more"],
  },

  // Admin environment subsections (in (env) layout)
  {
    id: "admin-system",
    path: "/admin/system",
    label: "System",
    icon: Server,
    group: "Environment",
    mode: "prod",
    adminOnly: true,
    surfaces: ["admin"],
    parent: "/admin/env",
  },
  {
    id: "admin-diagnostics",
    path: "/admin/diagnostics",
    label: "Diagnostics",
    icon: ScrollText,
    group: "Environment",
    mode: "prod",
    adminOnly: true,
    surfaces: ["admin"],
    parent: "/admin/env",
  },
  {
    id: "admin-api-log",
    path: "/admin/api-log",
    label: "API Log",
    icon: Activity,
    group: "Environment",
    mode: "prod",
    adminOnly: true,
    surfaces: ["admin"],
    parent: "/admin/env",
  },
  {
    id: "admin-price-cache",
    path: "/admin/price-cache",
    label: "Rate Cache",
    icon: Database,
    group: "Environment",
    mode: "prod",
    adminOnly: true,
    surfaces: ["admin"],
    parent: "/admin/env",
  },
  {
    id: "admin-integrations",
    path: "/admin/integrations",
    label: "Integrations",
    icon: Plug,
    group: "Environment",
    mode: "prod",
    adminOnly: true,
    surfaces: ["admin"],
    parent: "/admin/env",
  },

  // Special: More page menu items (not real pages, just nav entries)
  {
    id: "import-reconcile",
    path: "/import?tab=reconcile",
    parent: "/more",
    label: "Reconcile",
    icon: Inbox,
    group: "Tools",
    mode: "prod",
    surfaces: ["more"],
  },

  // Dev tools
  {
    id: "gallery",
    path: "/dev/gallery",
    parent: "/more",
    label: "Gallery",
    icon: Wrench,
    group: "Tools",
    mode: "dev",
    surfaces: ["sidebar", "more"],
  },
];

/**
 * Legacy pages that don't appear in nav but exist in the codebase.
 * Either redirect to canonical paths or render via parent page logic.
 */
export const ALIASES: AliasEntry[] = [
  // Settings legacy pages
  { path: "/settings/display", kind: "render-parent", target: "/settings/general" },
  { path: "/settings/dropdown-order", kind: "render-parent", target: "/settings/general" },
  { path: "/settings/data", kind: "render-parent", target: "/settings/developer" },
  { path: "/settings/bank-feeds", kind: "render-parent", target: "/settings/integrations" },
  { path: "/settings/rules", kind: "render-parent", target: "/settings/reconciliation" },
  { path: "/settings/import", kind: "render-parent", target: "/settings/reconciliation" },
  // /connect is the Integrations page with "Connect your AI" panel open
  { path: "/connect", kind: "render-parent", target: "/settings/integrations" },
];

/**
 * Path redirects with query preservation: old paths that should redirect to canonical paths.
 * Query strings are preserved automatically (Next.js default behavior).
 * These are exported for consumption by next.config.ts redirects().
 */
export interface RedirectEntry {
  source: string;
  destination: string;
  permanent: boolean;
}

export const REDIRECTS: RedirectEntry[] = [
  // /mcp is a vanity shortcut for the MCP server. 308 preserves POST/SSE bodies.
  { source: "/mcp", destination: "/api/mcp", permanent: true },
  { source: "/mcp/:path*", destination: "/api/mcp/:path*", permanent: true },
  // Money-in consolidation (2026-06-04): /import is the single account-anchored surface.
  // The legacy standalone routes fold into it and their page files are deleted (Phase 6),
  // so these redirects are now the only thing serving those paths.
  // Query strings (?account=, ?id=) are preserved automatically.
  // Not permanent yet — still soaking on dev; flip to permanent at prod promotion.
  // /import/pending is NOT matched (it's a live route — the standalone staged-review surface).
  // /reconcile and /import/reconcile now preserve ?tab=reconcile for the More menu.
  { source: "/inbox", destination: "/import", permanent: false },
  { source: "/reconcile", destination: "/import?tab=reconcile", permanent: false },
  { source: "/import/reconcile", destination: "/import?tab=reconcile", permanent: false },
  // /import/classic was the temporary legacy-hub backup (Phase 3b → 6);
  // deleted after validation. Redirect so old bookmarks don't 404.
  { source: "/import/classic", destination: "/import", permanent: false },
  // Subscriptions + Bill Calendar merged into one page (2026-10); the
  // calendar is now a view of /subscriptions.
  { source: "/calendar", destination: "/subscriptions?view=calendar", permanent: false },
  // Former redirect pages (C-36). permanent:false keeps the 307 that the deleted page redirect() calls sent.
  { source: "/admin/env", destination: "/admin/system", permanent: false },
  { source: "/settings/holding-accounts", destination: "/settings/investments", permanent: false },
  { source: "/settings/securities", destination: "/settings/investments", permanent: false },
];

/**
 * Get a registry entry by path.
 */
export function getNavEntry(path: string): NavPageEntry | undefined {
  return NAV_REGISTRY.find((e) => e.path === path);
}

/**
 * Get all entries for a specific surface.
 */
export function getEntriesBySurface(surface: Surface): NavPageEntry[] {
  return NAV_REGISTRY.filter((e) => e.surfaces.includes(surface));
}

/**
 * Get all entries in a specific group.
 */
export function getEntriesByGroup(group: string): NavPageEntry[] {
  return NAV_REGISTRY.filter((e) => e.group === group);
}

/**
 * Check if a path is in the registry (either as a page or an alias).
 */
export function isRegisteredPath(path: string): boolean {
  return !!getNavEntry(path) || !!ALIASES.find((a) => a.path === path);
}

/**
 * Get mobileBar entries sorted by tab order.
 */
export function getMobileBarItemsSorted(): NavPageEntry[] {
  const mobileEntries = getEntriesBySurface("mobileBar");
  return mobileEntries
    .filter((e) => e.tab?.order !== undefined)
    .sort((a, b) => (a.tab?.order ?? 0) - (b.tab?.order ?? 0));
}

/**
 * Pure helper to return the display label for a nav href.
 * When categoriesMerged is true and href is /categories, returns 'Categories'.
 * Otherwise returns the label unchanged.
 */
export function navLabel(href: string, label: string, { categoriesMerged = false }: { categoriesMerged?: boolean } = {}): string {
  if (categoriesMerged && href === "/categories") {
    return "Categories";
  }
  return label;
}
