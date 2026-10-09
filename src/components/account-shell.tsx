"use client";

/**
 * Account shell component — Header + Info/Security tab navigation.
 * Handles client-side layout for /account with support for nav-v2 back button.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/mobile";
import { getEntriesBySurface } from "@/lib/nav-config";

type TabItem = { href: string; label: string };

function getAccountTabs(): TabItem[] {
  return getEntriesBySurface("account")
    .filter((e) => e.parent === "/account")
    .map((entry) => ({
      href: entry.path,
      label: entry.label,
    }))
    .sort((a, b) => {
      // Sort: /account/info first, then /account/security
      const order = ["/account/info", "/account/security"];
      return order.indexOf(a.href) - order.indexOf(b.href);
    });
}

const TABS: TabItem[] = getAccountTabs();

export function AccountShell({
  children,
  navV2,
}: {
  children: React.ReactNode;
  navV2: boolean;
}) {
  const pathname = usePathname();
  const isHub = pathname === "/account";

  // Determine active tab
  const activeTab = TABS.find((t) => pathname === t.href)?.href || "/account/info";

  // On sub-pages with navV2, show back button
  const showBackButton = !isHub && navV2;

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header */}
      <PageHeader
        title="Account"
        titleClassName="text-2xl font-bold tracking-tight"
        subtitle={
          <>Profile, login, API key, privacy, and backup / restore</>
        }
        subtitleClassName="text-sm text-muted-foreground mt-0.5"
        backHref={showBackButton ? "/account" : undefined}
        backLabel={showBackButton ? "Back to Account" : undefined}
      />

      {/* Tab Navigation */}
      {!isHub && (
        <nav className="flex gap-4 border-b border-border" role="tablist">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                role="tab"
                aria-selected={isActive}
                className={cn(
                  "pb-3 text-sm font-medium transition-colors border-b-2 -mb-[2px]",
                  isActive
                    ? "text-foreground border-b-primary"
                    : "text-muted-foreground border-b-transparent hover:text-foreground"
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      )}

      {/* Content */}
      <div>{children}</div>
    </div>
  );
}
