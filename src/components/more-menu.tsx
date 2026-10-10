"use client";

/**
 * "More" screen (/more) at every size, iOS grouped-list style: PageHeader, an Account card, then
 * inset groups (src/components/mobile/inset-group.tsx). Narrow: one column. Wide (> 64rem): the
 * groups sit in two columns. Every entry is registry-driven (surface "more"); the rail and bottom
 * bar link here.
 */

import { useEffect, useRef, useState, useMemo, memo } from "react";
import useSWR from "swr";
import { softJsonFetcher, swrAggressiveOptions } from "@/lib/swr";
import { LogOut, type LucideIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { AccountSwitcher } from "@/components/account-switcher";
import { hardReload, clearPerUserStorage } from "@/lib/client/hard-reload";
import { setPasskeyAutoSkip } from "@/lib/client/passkey-auto";
import { getEntriesBySurface, navLabel } from "@/lib/nav-config";
import { useNavUnread } from "@/components/nav-unread";
import { PageHeader } from "@/components/mobile";
import { InsetGroup, InsetRow, InsetSectionHeader, ThemePicker, type ThemeChoice } from "@/components/mobile/inset-group";

export type MoreRow = { href: string; label: string; icon: LucideIcon; id: string };
export type MoreGroup = { id: string; header?: string; rows: MoreRow[] };

export interface MoreFlags {
  isAdmin: boolean;
  devMode: boolean;
  familyEnabled: boolean;
  hasAnnouncements: boolean;
  instanceAdminEnabled: boolean;
  categoriesMerged?: boolean;
}

const row = (href: string, label: string, icon: LucideIcon): MoreRow => ({ id: href, href, label, icon });

/** Pure builder so order/visibility is unit-testable. Sign out is rendered separately (last row of TOOLS). */
export function buildMoreGroups(f: MoreFlags): MoreGroup[] {
  const moreEntries = getEntriesBySurface("more");
  const entryMap = new Map(moreEntries.map((e) => [e.path, e]));

  // Build groups in the original order expected by the tests
  // main: core tracking + analysis + reconcile + import
  // explore: wealth + planning items
  // tools: what's new + feedback + settings (sign out added by component)
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
    // Skip settings/categorization when categories are merged into the hub
    if (f.categoriesMerged && path === "/settings/categorization") {
      continue;
    }
    const entry = entryMap.get(path);
    if (entry && (entry.mode !== "dev" || f.devMode)) {
      const displayLabel = navLabel(entry.path, entry.label, { categoriesMerged: f.categoriesMerged });
      main.push(row(entry.path, displayLabel, entry.icon));
    }
  }

  // Explore group: Wealth + Planning items
  const explorePaths = [
    "/subscriptions",
    "/loans",
    ...(f.devMode
      ? ["/chat", "/tax", "/scenarios", "/fire", "/api-docs", "/dev/gallery"]
      : []),
  ];

  for (const path of explorePaths) {
    const entry = entryMap.get(path);
    if (entry) {
      const displayLabel = navLabel(entry.path, entry.label, { categoriesMerged: f.categoriesMerged });
      explore.push(row(entry.path, displayLabel, entry.icon));
    }
  }

  // Tools group: What's new (conditional) + Feedback + Settings
  if (f.hasAnnouncements) {
    const entry = entryMap.get("/whats-new");
    if (entry) {
      const displayLabel = navLabel(entry.path, entry.label, { categoriesMerged: f.categoriesMerged });
      tools.push(row(entry.path, displayLabel, entry.icon));
    }
  }

  const feedbackEntry = entryMap.get("/feedback");
  if (feedbackEntry) {
    tools.push(row(feedbackEntry.path, feedbackEntry.label, feedbackEntry.icon));
  }

  const settingsEntry = entryMap.get("/settings");
  if (settingsEntry) {
    const displayLabel = navLabel(settingsEntry.path, settingsEntry.label, { categoriesMerged: f.categoriesMerged });
    tools.push(row(settingsEntry.path, displayLabel, settingsEntry.icon));
  }

  // Admin group (for admins only)
  if (f.isAdmin) {
    // Get all admin entries in order from registry
    const adminEntries = moreEntries.filter((e) => {
      if (!e.adminOnly || (e.mode === "dev" && !f.devMode)) return false;
      // Filter by feature flags
      if (e.flag === "family" && !f.familyEnabled) return false;
      if (e.flag === "instance" && !f.instanceAdminEnabled) return false;
      return true;
    });
    for (const entry of adminEntries) {
      const displayLabel = navLabel(entry.path, entry.label, { categoriesMerged: f.categoriesMerged });
      admin.push(row(entry.path, displayLabel, entry.icon));
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

export const MoreMenu = memo(function MoreMenu({ instanceAdminEnabled = false, categoriesMerged = false }: { instanceAdminEnabled?: boolean; categoriesMerged?: boolean }) {
  const busy = useRef(false);
  const nav = useNavUnread();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // Before mount the server render has no theme yet, so show "system" (as the old control did).
  const current: ThemeChoice = mounted ? ((theme as ThemeChoice | undefined) ?? "system") : "system";

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

  const isAdmin = sessionData?.isAdmin === true;
  const familyEnabled = sessionData?.familyWealthEnabled !== false;
  const devMode = Boolean(devModeData?.devMode);
  // Null while loading or on error: What's new stays visible, as before.
  const hasAnnouncements = nav.announcements === null ? true : nav.announcements.length > 0;
  // Unread badge per row, for the rows that had one in the old sidebar.
  const badges: Record<string, number> = {
    "/whats-new": nav.announcementsUnread,
    "/feedback": nav.feedbackUnread,
  };

  const flags: MoreFlags = useMemo(
    () => ({
      isAdmin,
      devMode,
      familyEnabled,
      hasAnnouncements,
      instanceAdminEnabled,
      categoriesMerged,
    }),
    [isAdmin, devMode, familyEnabled, hasAnnouncements, instanceAdminEnabled, categoriesMerged],
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
    // Bottom padding clears the floating tab bar (compact only; the rail takes its place from regular up).
    <div className="mx-auto max-w-xl space-y-6 pb-[var(--mobile-bar-clearance)] regular:pb-8 wide:max-w-3xl" data-testid="more-menu">
      <PageHeader title="More" />

      <section data-testid="more-account" className="space-y-2">
        <InsetSectionHeader>Account</InsetSectionHeader>
        {/* Current account (taps to /account), other accounts, Add account, Manage accounts. */}
        <InsetGroup inset="avatar" data-testid="more-account-card">
          <AccountSwitcher variant="list" />
        </InsetGroup>
      </section>

      <div className="space-y-6 wide:grid wide:grid-cols-2 wide:items-start wide:gap-6 wide:space-y-0">
        {groups.map((g) => (
          <section key={g.id} data-testid={`more-group-${g.id}`} className="space-y-2">
            {g.header && <InsetSectionHeader>{g.header}</InsetSectionHeader>}
            <InsetGroup>
              {g.rows.map((r) => (
                <InsetRow
                  key={r.id}
                  href={r.href}
                  label={r.label}
                  icon={r.icon}
                  badge={badges[r.href] ?? 0}
                  data-testid="more-row"
                />
              ))}
            </InsetGroup>
          </section>
        ))}

        <section data-testid="more-group-appearance" className="space-y-2">
          <InsetSectionHeader>Appearance</InsetSectionHeader>
          <InsetGroup data-testid="more-appearance">
            <ThemePicker value={current} onChange={(v) => setTheme(v)} />
          </InsetGroup>
        </section>
      </div>

      <section data-testid="more-group-session" className="space-y-2">
        <InsetGroup>
          <InsetRow destructive icon={LogOut} label="Log out" onClick={signOut} data-testid="more-signout" />
        </InsetGroup>
      </section>
    </div>
  );
});
