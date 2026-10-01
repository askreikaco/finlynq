"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
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
  CreditCard,
  CalendarDays,
  FlameKindling,
  GitBranch,
  MessageSquare,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  ShieldCheck,
  Inbox,
  Mailbox,
  Megaphone,
  MessageCircle,
  Server,
  Shield,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { FinlynqLogo } from "@/components/FinlynqLogo";
import { AccountSwitcher } from "@/components/account-switcher";

type NavItem = { href: string; label: string; icon: LucideIcon; color: string; mode?: "prod" | "dev"; activePrefixes?: string[] };

// Single-accent system: active items glow amber (`text-primary`) to match the
// landing's restraint. Inactive icons use the sidebar-foreground muted tones.
const ACTIVE_ACCENT = "text-primary";

export const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: "",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, color: ACTIVE_ACCENT, mode: "prod" },
      { href: "/whats-new", label: "What's New", icon: Megaphone, color: ACTIVE_ACCENT, mode: "prod" },
      { href: "/chat", label: "AI Chat", icon: MessageSquare, color: ACTIVE_ACCENT, mode: "dev" },
    ],
  },
  {
    label: "Tracking",
    items: [
      { href: "/transactions", label: "Transactions", icon: ArrowLeftRight, color: ACTIVE_ACCENT, mode: "prod" },
      { href: "/budgets", label: "Budgets", icon: PiggyBank, color: ACTIVE_ACCENT, mode: "prod" },
      { href: "/goals", label: "Goals", icon: Target, color: ACTIVE_ACCENT, mode: "prod" },
      { href: "/subscriptions", label: "Subscriptions", icon: CreditCard, color: ACTIVE_ACCENT, mode: "prod" },
      { href: "/calendar", label: "Calendar", icon: CalendarDays, color: ACTIVE_ACCENT, mode: "prod" },
    ],
  },
  {
    label: "Wealth",
    items: [
      { href: "/accounts", label: "Accounts", icon: Wallet, color: ACTIVE_ACCENT, mode: "prod" },
      { href: "/portfolio", label: "Portfolio", icon: TrendingUp, color: ACTIVE_ACCENT, mode: "prod" },
      { href: "/loans", label: "Loans & Debt", icon: Landmark, color: ACTIVE_ACCENT, mode: "prod" },
      { href: "/family", label: "Family Wealth", icon: Users, color: ACTIVE_ACCENT, mode: "prod" },
    ],
  },
  {
    label: "Analysis",
    items: [
      { href: "/reports", label: "Reports", icon: FileText, color: ACTIVE_ACCENT, mode: "prod" },
      { href: "/tax", label: "Tax", icon: Calculator, color: ACTIVE_ACCENT, mode: "dev" },
    ],
  },
  {
    label: "Planning",
    items: [
      { href: "/scenarios", label: "Scenarios", icon: GitBranch, color: ACTIVE_ACCENT, mode: "dev" },
      { href: "/fire", label: "FIRE Calculator", icon: FlameKindling, color: ACTIVE_ACCENT, mode: "dev" },
    ],
  },
];

export const adminLinks: NavItem[] = [
  { href: "/admin", label: "Admin", icon: ShieldCheck, color: ACTIVE_ACCENT, mode: "prod" },
  { href: "/admin/inbox", label: "Admin Inbox", icon: Inbox, color: ACTIVE_ACCENT, mode: "prod" },
  { href: "/admin/email-inbox", label: "Email Oversight", icon: Mailbox, color: ACTIVE_ACCENT, mode: "prod" },
  { href: "/admin/env", label: "Environment", icon: Server, color: ACTIVE_ACCENT, mode: "prod", activePrefixes: ["/admin/system", "/admin/diagnostics", "/admin/api-log", "/admin/price-cache", "/admin/integrations", "/admin/env"] },
  { href: "/admin/announcements", label: "Announcements", icon: Megaphone, color: ACTIVE_ACCENT, mode: "prod" },
  { href: "/admin/feedback", label: "Feedback", icon: MessageCircle, color: ACTIVE_ACCENT, mode: "prod" },
];

const toolLinks: NavItem[] = [
  // Consolidation Phase 3 (2026-06-04): /import is now the single
  // account-anchored money-in surface (upload + staging + reconcile tabs).
  // The standalone /reconcile link was folded in (it's the Reconcile tab);
  // /reconcile + /inbox + /import/reconcile redirect here (next.config.ts).
  { href: "/import", label: "Import", icon: Upload, color: ACTIVE_ACCENT, mode: "prod" },
  { href: "/api-docs", label: "API Docs", icon: FileText, color: ACTIVE_ACCENT, mode: "dev" },
  { href: "/feedback", label: "Your feedback", icon: MessageCircle, color: ACTIVE_ACCENT, mode: "prod" },
  { href: "/settings", label: "Settings", icon: Settings, color: ACTIVE_ACCENT, mode: "prod" },
];

export const mobileBarItems: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard, color: ACTIVE_ACCENT },
  { href: "/accounts", label: "Accounts", icon: Wallet, color: ACTIVE_ACCENT },
  { href: "/portfolio", label: "Portfolio", icon: TrendingUp, color: ACTIVE_ACCENT },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight, color: ACTIVE_ACCENT },
];

export const allFlatItems = navGroups.flatMap((g) => g.items).concat(toolLinks).concat(adminLinks);

export function Nav() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [adminPref, setAdminPref] = useState<boolean | null>(null);
  const [devMode, setDevMode] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [familyEnabled, setFamilyEnabled] = useState(true); // FAMILY_WEALTH_ENABLED (default on)
  const [unread, setUnread] = useState(0);
  const [hasAnnouncements, setHasAnnouncements] = useState(true); // default to true to avoid hiding on initial load
  const [feedbackUnread, setFeedbackUnread] = useState(0);


  useEffect(() => {
    const saved = localStorage.getItem("pf-sidebar-collapsed");
    if (saved === "true") setCollapsed(true);
    const groups: Record<string, boolean> = {};
    navGroups.forEach((g) => { if (g.label) groups[g.label] = true; });
    setOpenGroups(groups);

    // Initialize admin group open state from localStorage
    try {
      const savedAdminOpen = localStorage.getItem("nav.adminOpen");
      if (savedAdminOpen === "true") setAdminPref(true);
      else if (savedAdminOpen === "false") setAdminPref(false);
      // else: null (no explicit choice)
    } catch (_e) {
      // localStorage not available, adminOpen stays null
    }

    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((data) => {
        setIsAdmin(data.isAdmin === true);
        if (data.familyWealthEnabled === false) setFamilyEnabled(false);
      })
      .catch(() => {});
    fetch("/api/settings/dev-mode")
      .then((r) => r.json())
      .then((data) => { if (data.devMode) setDevMode(true); })
      .catch(() => {});
  }, []);

  // Admin group is open when the user explicitly opened it (adminPref === true),
  // or while on an /admin page (adminPref === null, derived state).
  // Collapsing works, and returns to the saved pref once the user leaves /admin.
  const adminOpen = adminPref ?? (isAdmin && pathname.startsWith("/admin"));

  // Unread announcement count for the "What's New" badge. Refetched on every
  // navigation so the badge clears after the user visits /whats-new (which
  // marks items read server-side). Also tracks whether any announcements exist.
  useEffect(() => {
    fetch("/api/announcements")
      .then((r) => (r.ok ? r.json() : null))
      .then((list) => {
        if (Array.isArray(list)) {
          setHasAnnouncements(list.length > 0);
          setUnread(list.filter((a: { read?: boolean }) => !a.read).length);
        }
      })
      .catch(() => {});
  }, [pathname]);

  // Unread feedback-reply count for the "Your feedback" badge. Same
  // refetch-on-navigation pattern as the announcements badge above — clears
  // after the user opens a thread (which marks it read server-side).
  useEffect(() => {
    fetch("/api/feedback")
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => {
        if (Array.isArray(list)) {
          setFeedbackUnread(list.filter((t: { unread?: boolean }) => t.unread).length);
        }
      })
      .catch(() => {});
  }, [pathname]);

  // Unread count to badge a given nav link (0 = no badge).
  const unreadFor = (href: string) =>
    href === "/whats-new" ? unread : href === "/feedback" ? feedbackUnread : 0;

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("pf-sidebar-collapsed", String(next));
  };

  const toggleGroup = (label: string) => {
    setOpenGroups((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  const toggleAdminGroup = () => {
    const next = !adminOpen;
    setAdminPref(next);
    try {
      localStorage.setItem("nav.adminOpen", String(next));
    } catch (_e) {
      // localStorage not available, just update state
    }
  };

  const renderLink = (item: NavItem, showLabel: boolean) => {
    // Check activePrefixes first if they exist, otherwise use default href matching
    let isActive = false;
    if (item.activePrefixes && item.activePrefixes.length > 0) {
      isActive = item.activePrefixes.some(prefix =>
        pathname === prefix || pathname.startsWith(prefix + "/")
      );
    } else {
      isActive = pathname === item.href || pathname.startsWith(item.href + "/");
    }
    const badge = unreadFor(item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        title={!showLabel ? item.label : undefined}
        aria-current={isActive ? "page" : undefined}
        className={cn(
          "group/link relative flex items-center gap-3 rounded-lg text-[13px] font-medium transition-all duration-200",
          showLabel ? "px-3 py-2" : "px-0 py-2 justify-center",
          isActive
            ? "bg-white/[0.08] text-sidebar-accent-foreground"
            : "text-sidebar-foreground/50 hover:bg-white/[0.05] hover:text-sidebar-foreground"
        )}
      >
        {isActive && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-full bg-sidebar-primary shadow-[0_0_8px_2px] shadow-sidebar-primary/30" />
        )}
        <item.icon className={cn(
          "h-[18px] w-[18px] shrink-0 transition-all duration-200",
          isActive ? item.color : "text-sidebar-foreground/40 group-hover/link:text-sidebar-foreground/70 group-hover/link:scale-110"
        )} />
        {/* Collapsed-sidebar unread dot (What's New + Your feedback) */}
        {!showLabel && badge > 0 && (
          <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-primary" />
        )}
        {showLabel && <span className="truncate">{item.label}</span>}
        {showLabel && badge > 0 ? (
          <span className="ml-auto rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold leading-none text-primary-foreground">
            {badge}
          </span>
        ) : (
          showLabel && isActive && <div className="ml-auto h-1.5 w-1.5 rounded-full bg-sidebar-primary animate-pulse" />
        )}
      </Link>
    );
  };

  const sidebar = (
    <nav
      aria-label="Main navigation"
      className={cn(
        "hidden md:flex flex-col bg-sidebar h-[calc(100vh-var(--sat))] sticky top-safe border-r border-sidebar-border/50 transition-[width] duration-200 ease-in-out overflow-hidden",
        collapsed ? "w-14" : "w-60"
      )}
    >
      {/* Logo */}
      <Link href="/dashboard" className={cn("flex items-center gap-3 py-5 mb-2 group/logo", collapsed ? "px-3 justify-center" : "px-5")}>
        <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-card/50 shrink-0 transition-transform duration-300 group-hover/logo:scale-110">
          <FinlynqLogo size={28} />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <span className="text-base font-semibold text-sidebar-foreground whitespace-nowrap tracking-tight">Finlynq</span>
            <p className="text-[10px] text-sidebar-foreground/50 leading-none whitespace-nowrap">Track here, analyze anywhere</p>
          </div>
        )}
      </Link>

      {/* Nav groups */}
      <div className="flex-1 px-2 space-y-1 overflow-y-auto">
        {navGroups.map((group) => {
          const visibleItems = group.items.filter((item) => {
            // Hide What's New when there are no announcements
            if (item.label === "What's New" && !hasAnnouncements) return false;
            if (item.href === "/family" && !familyEnabled) return false;
            return devMode || item.mode !== "dev";
          });
          if (visibleItems.length === 0) return null;
          return (
          <div key={group.label || "top"}>
            {group.label && !collapsed && (
              <button
                onClick={() => toggleGroup(group.label)}
                className="flex items-center w-full px-3 mb-1 mt-5 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/30 hover:text-sidebar-foreground/50 transition-colors"
              >
                <ChevronDown
                  className={cn(
                    "h-3 w-3 mr-1 transition-transform duration-200",
                    !openGroups[group.label] && "-rotate-90"
                  )}
                />
                {group.label}
              </button>
            )}
            {collapsed && group.label && (
              <div className="mx-auto my-2 w-6 border-t border-sidebar-border" />
            )}
            {(collapsed || !group.label || openGroups[group.label]) &&
              visibleItems.map((item) => renderLink(item, !collapsed))}
          </div>
          );
        })}
      </div>

      {/* Bottom section */}
      <div className="flex-col flex border-t border-sidebar-border/50">
        {/* Scrollable tools + admin group area */}
        <div className="flex-1 min-h-0 overflow-y-auto px-2 pt-2 pb-2 space-y-0.5">
          {/* Regular tool links */}
          {toolLinks.filter((item) => devMode || item.mode !== "dev").map((item) => renderLink(item, !collapsed))}

          {/* Admin group (collapsible) */}
          {isAdmin && (
            <div>
              {!collapsed && (
                <button
                  onClick={toggleAdminGroup}
                  aria-expanded={adminOpen}
                  aria-controls="nav-admin-links"
                  className="flex items-center w-full px-3 mb-1 mt-3 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/30 hover:text-sidebar-foreground/50 transition-colors"
                >
                  <ChevronDown
                    className={cn(
                      "h-3 w-3 mr-1 transition-transform duration-200",
                      !adminOpen && "-rotate-90"
                    )}
                  />
                  Admin
                </button>
              )}
              {collapsed && (
                <Link
                  href="/admin"
                  title="Admin"
                  aria-label="Admin"
                  className={cn(
                    "group/link relative flex items-center gap-3 rounded-lg text-[13px] font-medium transition-all duration-200 px-0 py-2 justify-center",
                    pathname.startsWith("/admin")
                      ? "bg-white/[0.08] text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/50 hover:bg-white/[0.05] hover:text-sidebar-foreground"
                  )}
                >
                  {pathname.startsWith("/admin") && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-full bg-sidebar-primary shadow-[0_0_8px_2px] shadow-sidebar-primary/30" />
                  )}
                  <Shield className={cn(
                    "h-[18px] w-[18px] shrink-0 transition-all duration-200",
                    pathname.startsWith("/admin") ? "text-primary" : "text-sidebar-foreground/40 group-hover/link:text-sidebar-foreground/70"
                  )} />
                </Link>
              )}
              {adminOpen && !collapsed && (
                <div id="nav-admin-links" className="space-y-0.5 max-h-[40vh] overflow-y-auto">
                  {adminLinks.filter((item) => devMode || item.mode !== "dev").map((item) => renderLink(item, !collapsed))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Fixed bottom block: Account switcher, theme toggle, collapse button */}
        <div className="shrink-0 px-2 pb-3 pt-2 border-t border-sidebar-border/50 space-y-0.5">
          <AccountSwitcher compact={collapsed} />
          <div className={cn("flex items-center mt-2", collapsed ? "justify-center" : "justify-between px-1")}>
            <ThemeToggle />
            <button
              onClick={toggleCollapsed}
              className="p-1.5 rounded-lg text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-all duration-200 hover:scale-110"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </nav>
  );

  // Mobile bottom bar
  const moreActive = pathname === "/more" || pathname.startsWith("/more/");
  const mobileBar = (
    <nav aria-label="Mobile navigation" className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-sidebar border-t border-sidebar-border pb-[var(--sab)] pl-[var(--sal)] pr-[var(--sar)]">
      <div className="flex items-stretch justify-around h-14">
        {mobileBarItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              aria-current={isActive ? "page" : undefined}
              href={item.href}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center gap-0.5 py-1 px-0.5 text-[10px] font-medium tracking-tight whitespace-nowrap transition-colors",
                isActive ? "text-sidebar-primary" : "text-sidebar-foreground/50"
              )}
            >
              <item.icon className={cn("h-5 w-5", isActive && item.color)} />
              {item.label}
            </Link>
          );
        })}
        <Link
          href="/more"
          aria-label="More"
          aria-current={moreActive ? "page" : undefined}
          className={cn(
            "flex min-w-0 flex-1 flex-col items-center gap-0.5 py-1 px-0.5 text-[10px] font-medium tracking-tight whitespace-nowrap transition-colors",
            moreActive ? "text-sidebar-primary" : "text-sidebar-foreground/50"
          )}
        >
          <MoreHorizontal className="h-5 w-5" />
          More
        </Link>
      </div>
    </nav>
  );

  return (
    <>
      {sidebar}
      {mobileBar}
    </>
  );
}
