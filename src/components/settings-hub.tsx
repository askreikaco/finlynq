/**
 * Settings hub page — iOS grouped list showing all settings sections.
 * Rendered when FINLYNQ_NAV_V2 is enabled; otherwise the shell navigation is used.
 */

import { getEntriesBySurface } from "@/lib/nav-config";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/mobile/page-header";

/** iOS-style groups: each group is one inset rounded list. Order is fixed; entries come from the registry. */
const GROUPS: Array<{ title: string; paths: string[] }> = [
  {
    title: "Preferences",
    paths: ["/settings/general", "/settings/categorization", "/settings/reconciliation", "/settings/investments"],
  },
  {
    title: "Connections and system",
    paths: ["/settings/integrations", "/settings/developer", "/settings/about"],
  },
];

/**
 * Settings hub (iOS multi-level menu, level 1). Large "Settings" title, grouped inset lists:
 * icon tile, label, chevron-right. Tapping a row pushes the detail page.
 * Rendered when FINLYNQ_NAV_V2 is enabled; otherwise the shell navigation is used.
 */
export function SettingsHub() {
  const entries = getEntriesBySurface("settings");
  const groups = GROUPS.map((g) => ({
    title: g.title,
    entries: g.paths
      .map((path) => entries.find((e) => e.path === path))
      .filter((e): e is NonNullable<typeof e> => Boolean(e)),
  })).filter((g) => g.entries.length > 0);

  if (groups.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-muted-foreground">
        No settings available.
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
        title="Settings"
        titleClassName="text-2xl font-bold tracking-tight max-md:text-4xl/[41px] max-md:font-bold"
      />
      {groups.map((group) => (
        <section key={group.title} data-slot="settings-hub-group" className="space-y-2">
          <h2 className="px-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {group.title}
          </h2>
          <div className="divide-y divide-border/50 overflow-hidden rounded-2xl bg-card">
            {group.entries.map((entry) => {
              const Icon = entry.icon;
              return (
                <Link
                  key={entry.path}
                  href={entry.path}
                  data-slot="settings-hub-row"
                  className="flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <span
                    data-slot="settings-hub-icon"
                    className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
                  >
                    <Icon className="size-[18px]" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-base text-foreground">{entry.label}</span>
                  <ChevronRight data-slot="settings-hub-chevron" aria-hidden className="size-5 shrink-0 text-muted-foreground" />
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
