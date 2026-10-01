"use client";

/**
 * Mobile "More" screen (/more) — mirrors the native app's More tab: large
 * title + grouped rounded cards of rows (icon tile, label, chevron).
 * Mobile only: >= md the sidebar already lists everything, so we redirect.
 * Replaces the old bottom-sheet drawer; every entry it offered stays here.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  PiggyBank,
  Target,
  FileText,
  Inbox,
  Tag,
  Upload,
  Megaphone,
  Users,
  Settings,
  LogOut,
  CreditCard,
  CalendarDays,
  Landmark,
  MessageSquare,
  Calculator,
  GitBranch,
  FlameKindling,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { adminLinks } from "@/components/nav";
import { AccountSwitcher } from "@/components/account-switcher";
import { hardReload, clearPerUserStorage } from "@/lib/client/hard-reload";
import { setPasskeyAutoSkip } from "@/lib/client/passkey-auto";

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
  const groups: MoreGroup[] = [
    {
      id: "main",
      rows: [
        row("/budgets", "Budgets", PiggyBank),
        row("/goals", "Goals", Target),
        row("/reports", "Reports", FileText),
        row("/import?tab=reconcile", "Reconcile", Inbox),
        row("/settings/categorization", "Categories", Tag),
        row("/import", "Import", Upload),
      ],
    },
    {
      id: "explore",
      header: "Explore",
      rows: [
        row("/subscriptions", "Subscriptions", CreditCard),
        row("/calendar", "Calendar", CalendarDays),
        row("/loans", "Loans & Debt", Landmark),
        ...(f.devMode
          ? [
              row("/chat", "AI Chat", MessageSquare),
              row("/tax", "Tax", Calculator),
              row("/scenarios", "Scenarios", GitBranch),
              row("/fire", "FIRE Calculator", FlameKindling),
              row("/api-docs", "API Docs", FileText),
            ]
          : []),
      ],
    },
    {
      id: "tools",
      header: "Tools",
      rows: [
        ...(f.hasAnnouncements ? [row("/whats-new", "What's new", Megaphone)] : []),
        ...(f.familyEnabled ? [row("/family", "Family Wealth", Users)] : []),
        row("/settings", "Settings", Settings),
      ],
    },
  ];
  if (f.isAdmin) {
    groups.push({
      id: "admin",
      header: "Admin",
      rows: adminLinks
        .filter((i) => f.devMode || i.mode !== "dev")
        .map((i) => row(i.href, i.label, i.icon)),
    });
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

export function MoreMenu() {
  const router = useRouter();
  const [flags, setFlags] = useState<MoreFlags>({
    isAdmin: false,
    devMode: false,
    familyEnabled: true,
    hasAnnouncements: true, // optimistic, as in nav.tsx
  });
  const [unread, setUnread] = useState(0);
  const busy = useRef(false);

  // Desktop has the sidebar: bounce /more -> /dashboard.
  useEffect(() => {
    if (typeof window.matchMedia === "function" && window.matchMedia("(min-width: 768px)").matches) {
      router.replace("/dashboard");
    }
  }, [router]);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((d) =>
        setFlags((p) => ({ ...p, isAdmin: d.isAdmin === true, familyEnabled: d.familyWealthEnabled !== false })),
      )
      .catch(() => {});
    fetch("/api/settings/dev-mode")
      .then((r) => r.json())
      .then((d) => d.devMode && setFlags((p) => ({ ...p, devMode: true })))
      .catch(() => {});
    fetch("/api/announcements")
      .then((r) => (r.ok ? r.json() : null))
      .then((list) => {
        if (Array.isArray(list)) {
          setFlags((p) => ({ ...p, hasAnnouncements: list.length > 0 }));
          setUnread(list.filter((a: { read?: boolean }) => !a.read).length);
        }
      })
      .catch(() => {});
  }, []);

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

      <Card testId="more-account">
        <div className="px-1 py-1 [&_*]:text-foreground" aria-label="Account">
          <AccountSwitcher compact={false} />
        </div>
      </Card>

      {groups.map((g) => (
        <section key={g.id} data-testid={`more-group-${g.id}`} className="space-y-2">
          {g.header && (
            <h2 className="px-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {g.header}
            </h2>
          )}
          <Card>
            {g.rows.map((r) => (
              <Link key={r.id} href={r.href} className={rowCls} data-testid="more-row">
                <span className={tile}>
                  <r.icon className="h-[18px] w-[18px]" aria-hidden="true" />
                </span>
                <span className="flex-1 truncate">{r.label}</span>
                {r.href === "/whats-new" && unread > 0 && (
                  <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold leading-none text-primary-foreground">
                    {unread}
                  </span>
                )}
                <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              </Link>
            ))}
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
}
