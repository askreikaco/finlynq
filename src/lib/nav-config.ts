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
  type LucideIcon,
} from "lucide-react";

export type Surface = "sidebar" | "mobileBar" | "more" | "settings" | "admin" | "account";
export type Flag = "family" | "announcements";
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
  color?: string; // default ACTIVE_ACCENT for now
  activePrefixes?: string[]; // for parent routes that should highlight child paths
}

export interface AliasEntry {
  path: string;
  kind: "redirect" | "render-parent"; // redirect: old path -> new; render-parent: old page renders parent
  target: string; // canonical path or parent path
}

export interface RedirectEntry {
  source: string;
  destination: string;
  preserveQuery?: boolean; // if true, preserve query params; default false for legacy redirects
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
  },
  {
    id: "whats-new",
    path: "/whats-new",
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
  },
  {
    id: "budgets",
    path: "/budgets",
    label: "Budgets",
    icon: PiggyBank,
    group: "Tracking",
    mode: "prod",
    surfaces: ["sidebar", "more"],
  },
  {
    id: "goals",
    path: "/goals",
    label: "Goals",
    icon: Target,
    group: "Tracking",
    mode: "prod",
    surfaces: ["sidebar", "more"],
  },
  {
    id: "subscriptions",
    path: "/subscriptions",
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
  },
  {
    id: "loans",
    path: "/loans",
    label: "Loans & Debt",
    icon: Landmark,
    group: "Wealth",
    mode: "prod",
    surfaces: ["sidebar", "more"],
  },
  {
    id: "family",
    path: "/family",
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
    label: "Reports",
    icon: FileText,
    group: "Analysis",
    mode: "prod",
    surfaces: ["sidebar", "more"],
  },
  {
    id: "categories",
    path: "/categories",
    label: "Spending by category",
    icon: ChartPie,
    group: "Analysis",
    mode: "prod",
    surfaces: ["sidebar", "more"],
  },
  {
    id: "tax",
    path: "/tax",
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
    label: "Scenarios",
    icon: GitBranch,
    group: "Planning",
    mode: "dev",
    surfaces: ["sidebar", "more"],
  },
  {
    id: "fire",
    path: "/fire",
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
    label: "API Docs",
    icon: FileText,
    group: "Tools",
    mode: "dev",
    surfaces: ["sidebar", "more"],
  },
  {
    id: "feedback",
    path: "/feedback",
    label: "Feedback",
    icon: MessageCircle,
    group: "Tools",
    mode: "prod",
    surfaces: ["sidebar"],
  },
  {
    id: "settings",
    path: "/settings",
    label: "Settings",
    icon: Settings,
    group: "Tools",
    mode: "prod",
    surfaces: ["sidebar", "more"],
    activePrefixes: ["/settings"],
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
    label: "User feedback",
    icon: MessageCircle,
    group: "Admin",
    mode: "prod",
    adminOnly: true,
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
    icon: FileText,
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
    icon: FileText,
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
    icon: FileText,
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
    icon: Server,
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
    label: "Reconcile",
    icon: Inbox,
    group: "Tools",
    mode: "prod",
    surfaces: ["more"],
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
  { path: "/settings/securities", kind: "render-parent", target: "/settings/investments" },
  { path: "/settings/holding-accounts", kind: "render-parent", target: "/settings/investments" },
  { path: "/settings/rules", kind: "render-parent", target: "/settings/reconciliation" },
  { path: "/settings/import", kind: "render-parent", target: "/settings/reconciliation" },
  // /connect is the Integrations page with "Connect your AI" panel open
  { path: "/connect", kind: "render-parent", target: "/settings/integrations" },
];

/**
 * Redirects that should preserve query parameters (e.g., ?tab, ?account).
 * These are used in next.config.ts and handled specially to keep query strings.
 */
export const REDIRECTS_PRESERVE_QUERY: RedirectEntry[] = [
  { source: "/reconcile", destination: "/import", preserveQuery: true },
  { source: "/import/reconcile", destination: "/import", preserveQuery: true },
  { source: "/inbox", destination: "/import", preserveQuery: true },
];

/**
 * Redirects that should NOT preserve query parameters (legacy consolidation).
 */
export const REDIRECTS_LEGACY: RedirectEntry[] = [
  { source: "/import/classic", destination: "/import", preserveQuery: false },
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
