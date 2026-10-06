"use client";

/**
 * Mobile "More" screen (/more) — mirrors the native app's More tab: large
 * title + grouped rounded cards of rows (icon tile, label, chevron).
 * Mobile only: >= md the sidebar already lists everything, so we redirect.
 * Replaces the old bottom-sheet drawer; every entry it offered stays here.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useMemo, memo } from "react";
import useSWR from "swr";
import { softJsonFetcher, swrAggressiveOptions } from "@/lib/swr";
import {
  LogOut,
  ChevronRight,
  Palette,
  type LucideIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { AccountSwitcher } from "@/components/account-switcher";
import { hardReload, clearPerUserStorage } from "@/lib/client/hard-reload";
import { setPasskeyAutoSkip } from "@/lib/client/passkey-auto";
import { getEntriesBySurface } from "@/lib/nav-config";

export type MoreRow = { href: string; label: string; icon: LucideIcon; id: string };
export type MoreGroup = { id: string; header?: string; rows: MoreRow[] };

export interface MoreFlags {
  isAdmin: boolean;
  devMode: boolean;
  familyEnabled: boolean;
  hasAnnouncements: boolean;
}

const row = (href: string, label: string, icon: LucideIcon): MoreRow => ({ id: href, href, label, icon });

/** Pure builder so order/visibility is unit-testable. Sign out is rendered separately (last row of TOOLS). */
export function buildMoreGroups(f: MoreFlags): MoreGroup[] {
  const moreEntries = getEntriesBySurface("more");
  const entryMap = new Map(moreEntries.map((e) => [e.path, e]));

  // Build groups in the original order expected by the tests
  // main: core tracking + analysis + reconcile + import
  // explore: wealth + planning items
  // tools: what's new + settings (sign out added by component)
  // admin: admin items (for admins only)

  const main: MoreRow[] = [];
  const explore: MoreRow[] = [];
  const tools: MoreRow[] = [];
  const admin: MoreRow[] = [];

  // Main group: Tracking (Budgets, Goals) + Analysis (Reports, Categories) + Settings (Categorization) + Import + Reconcile
  const mainPaths = [
    "/budgets",
    "/goals",
    "/reports",
    "/categories",
    ...(f.familyEnabled ? ["/family"] : []),
    "/import?tab=reconcile",
    "/settings/categorization",
    "/import",
  ];

  for (const path of mainPaths) {
    const entry = entryMap.get(path);
    if (entry && (entry.mode !== "dev" || f.devMode)) {
      main.push(row(entry.path, entry.label, entry.icon));
    }
  }

  // Explore group: Wealth + Planning items
  const explorePaths = [
    "/subscriptions",
    "/loans",
    ...(f.devMode
      ? ["/chat", "/tax", "/scenarios", "/fire", "/api-docs"]
      : []),
  ];

  for (const path of explorePaths) {
    const entry = entryMap.get(path);
    if (entry) {
      explore.push(row(entry.path, entry.label, entry.icon));
    }
  }

  // Tools group: What's new (conditional) + Settings
  if (f.hasAnnouncements) {
    const entry = entryMap.get("/whats-new");
    if (entry) {
      tools.push(row(entry.path, entry.label, entry.icon));
    }
  }

  const settingsEntry = entryMap.get("/settings");
  if (settingsEntry) {
    tools.push(row(settingsEntry.path, settingsEntry.label, settingsEntry.icon));
  }

  // Admin group (for admins only)
  if (f.isAdmin) {
    // Get all admin entries in order from registry
    const adminEntries = moreEntries.filter((e) => e.adminOnly && (e.mode !== "dev" || f.devMode));
    for (const entry of adminEntries) {
      admin.push(row(entry.path, entry.label, entry.icon));
    }
  }

  const groups: MoreGroup[] = [];

  if (main.length > 0) {
    groups.push({ id: "main", rows: main });
  }

  if (explore.length > 0) {
    groups.push({ id: "explore", header: "Explore", rows: explore });
  }

  if (tools.length > 0) {
    groups.push({ id: "tools", header: "Tools", rows: tools });
  }

  if (admin.length > 0) {
    groups.push({ id: "admin", header: "Admin", rows: admin });
  }

  return groups;
}

const tile = "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted/60";
const rowCls =
  "flex w-full items-center gap-3 px-3 py-3 text-left text-base font-medium text-foreground transition-colors hover:bg-muted/40 active:bg-muted/60";

function Card({ children, testId }: { children: React.ReactNode; testId?: string }) {
  return (
    <div
      data-testid={testId}
      className="overflow-hidden rounded-2xl border border-border bg-card divide-y divide-border"
    >
      {children}
    </div>
  );
}

const THEME_CHOICES = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const;

/** 44px row: icon tile, label, System/Light/Dark segmented control (next-themes). */
export function AppearanceRow() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const current = mounted ? (theme ?? "system") : "system";
  return (
    <div className="flex min-h-11 w-full items-center gap-3 px-3 py-2" data-testid="more-appearance">
      <span className={tile}>
        <Palette className="h-[18px] w-[18px]" aria-hidden="true" />
      </span>
      <span className="flex-1 truncate text-base font-medium">Appearance</span>
      <div role="radiogroup" aria-label="Appearance" className="flex shrink-0 rounded-lg bg-muted/60 p-0.5">
        {THEME_CHOICES.map((c) => (
          <button
            key={c.value}
            type="button"
            role="radio"
            aria-checked={current === c.value}
            onClick={() => setTheme(c.value)}
            className={cn(
              "min-h-9 rounded-md px-2.5 text-xs font-medium transition-colors",
              current === c.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export const MoreMenu = memo(function MoreMenu() {
  const router = useRouter();
  const busy = useRef(false);

  // Desktop has the sidebar: bounce /more -> /dashboard.
  useEffect(() => {
    if (typeof window.matchMedia === "function" && window.matchMedia("(min-width: 768px)").matches) {
      router.replace("/dashboard");
    }
  }, [router]);

  const { data: sessionData } = useSWR<{ isAdmin?: boolean; familyWealthEnabled?: boolean }>(
    "/api/auth/session",
    softJsonFetcher({}),
    swrAggressiveOptions,
  );
  const { data: devModeData } = useSWR<{ devMode?: boolean }>(
    "/api/settings/dev-mode",
    softJsonFetcher({}),
    swrAggressiveOptions,
  );
  const { data: announcementsData } = useSWR<Array<{ id: number; read?: boolean }> | null>(
    "/api/announcements",
    softJsonFetcher(null),
    swrAggressiveOptions,
  );

  const isAdmin = sessionData?.isAdmin === true;
  const familyEnabled = sessionData?.familyWealthEnabled !== false;
  const devMode = Boolean(devModeData?.devMode);
  const announcementsList = Array.isArray(announcementsData) ? announcementsData : [];
  const hasAnnouncements =
    announcementsData === undefined || announcementsData === null
      ? true
      : announcementsList.length > 0;
  const unread = announcementsList.filter((a) => !a.read).length;

  const flags: MoreFlags = useMemo(
    () => ({
      isAdmin,
      devMode,
      familyEnabled,
      hasAnnouncements,
    }),
    [isAdmin, devMode, familyEnabled, hasAnnouncements],
  );

  const signOut = async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      let activeId: string | undefined;
      try {
        const acc = await fetch("/api/auth/accounts");
        if (acc.ok) {
          const list = await acc.json();
          activeId = Array.isArray(list) ? list.find((a: { active?: boolean }) => a.active)?.userId : undefined;
        }
      } catch {
        /* storage cleanup is best-effort */
      }
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (!res.ok && res.status !== 401) {
        busy.current = false;
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (activeId) clearPerUserStorage(activeId);
      setPasskeyAutoSkip();
      hardReload(res.ok && data?.activeUserId ? "/dashboard" : "/");
    } catch {
      busy.current = false;
    }
  };

  const groups = buildMoreGroups(flags);

  return (
    <div className="mx-auto max-w-xl space-y-6 md:hidden" data-testid="more-menu">
      <h1 className="text-4xl font-bold tracking-tight">More</h1>

      <section data-testid="more-account" className="space-y-2">
        <h2 className="px-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Account</h2>
        <Card>
          <AccountSwitcher variant="list" />
        </Card>
      </section>

      {groups.map((g) => (
        <section key={g.id} data-testid={`more-group-${g.id}`} className="space-y-2">
          {g.header && (
            <h2 className="px-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {g.header}
            </h2>
          )}
          <Card>
            {g.rows.map((r) => {
              const showUnreadBadge = r.href === "/whats-new" && unread > 0;
              return (
                <Link key={r.id} href={r.href} className={rowCls} data-testid="more-row">
                  <span className={tile}>
                    <r.icon className="h-[18px] w-[18px]" aria-hidden="true" />
                  </span>
                  <span className="flex-1 truncate">{r.label}</span>
                  {showUnreadBadge && (
                    <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold leading-none text-primary-foreground">
                      {unread}
                    </span>
                  )}
                  <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                </Link>
              );
            })}
            {g.id === "tools" && <AppearanceRow />}
            {g.id === "tools" && (
              <button type="button" onClick={signOut} className={cn(rowCls, "text-destructive")} data-testid="more-signout">
                <span className={tile}>
                  <LogOut className="h-[18px] w-[18px]" aria-hidden="true" />
                </span>
                <span className="flex-1">Sign out</span>
              </button>
            )}
          </Card>
        </section>
      ))}
    </div>
  );
});
