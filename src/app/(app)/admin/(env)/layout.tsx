"use client";

/**
 * /admin/(env) shared layout — horizontal tab shell that wraps every /admin/system,
 * /admin/diagnostics, /admin/api-log, /admin/price-cache, /admin/integrations sub-page.
 * Route group (env) does not change URLs — the tabs navigate to /admin/system etc.
 *
 * - md+ : horizontal tab row above content
 * - <md : horizontal scrollable pill row above content
 *
 * Active state idiom: amber left-edge marker (desktop) + glow (mobile),
 * copying the settings layout and nav sidebar visual language.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { getEntriesBySurface } from "@/lib/nav-config";

type NavItem = { href: string; label: string; icon: LucideIcon };

function getAdminEnvItems(): NavItem[] {
  return getEntriesBySurface("admin")
    .filter((e) => e.parent === "/admin/env")
    .map((entry) => ({
      href: entry.path,
      label: entry.label,
      icon: entry.icon,
    }));
}

const NAV_ITEMS: NavItem[] = getAdminEnvItems();

function activeHref(pathname: string): string {
  let best: string | null = null;
  for (const item of NAV_ITEMS) {
    if (pathname === item.href || pathname.startsWith(item.href + "/")) {
      if (!best || item.href.length > best.length) best = item.href;
    }
  }
  return best ?? "";
}

export default function EnvLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const active = activeHref(pathname);

  return (
    <div className="flex flex-col gap-6">
      {/* Scrollable horizontal tab row (responsive) */}
      <nav
        aria-label="Environment sections"
        className="-mx-4 px-4 regular:-mx-6 regular:px-6 wide:-mx-8 wide:px-8"
      >
        <div className="flex gap-2 overflow-x-auto pb-2 regular:pb-0">
          {NAV_ITEMS.map((item) => {
            const isActive = item.href === active;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "group/tab relative flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 shrink-0 regular:shrink",
                  isActive
                    ? "bg-white/[0.08] text-foreground"
                    : "text-muted-foreground hover:bg-white/[0.05] hover:text-foreground"
                )}
              >
                {isActive && (
                  <div className="regular:hidden absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-full bg-primary shadow-[0_0_8px_2px] shadow-primary/30" />
                )}
                <item.icon className={cn(
                  "h-4 w-4 transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground group-hover/tab:text-foreground"
                )} />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Content slot */}
      <div>{children}</div>
    </div>
  );
}
