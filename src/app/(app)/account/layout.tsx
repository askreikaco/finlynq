"use client";

/**
 * /account shared layout — Header + Info/Security tab navigation.
 * Mobile-friendly two-tab layout for user profile and account security.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/mobile";

type TabItem = { href: string; label: string };

const TABS: TabItem[] = [
  { href: "/account/info", label: "Info" },
  { href: "/account/security", label: "Security" },
];

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Determine active tab
  const activeTab = TABS.find(t => pathname === t.href)?.href || "/account/info";

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header */}
      <PageHeader
        title="Account"
        titleClassName="text-2xl font-bold tracking-tight"
        subtitle={<>Profile, login, API key, privacy, and backup / restore</>}
        subtitleClassName="text-sm text-muted-foreground mt-0.5"
      />

      {/* Tab Navigation */}
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

      {/* Content */}
      <div>{children}</div>
    </div>
  );
}
