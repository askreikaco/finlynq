"use client";

/**
 * Settings hub page (level 1, every size): grouped inset lists of all settings sections.
 */

import { CardLabel } from "@/components/mobile/card-label";
import { groupLabelIcon } from "@/components/mobile/group-label-icon";
import { cn } from "@/lib/utils";
import { getEntriesBySurface } from "@/lib/nav-config";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/mobile/page-header";
import { isCurrentRoute, useColumnCurrent } from "@/components/mobile/column-context";

/** iOS-style groups: each group is one inset rounded list. Order is fixed; entries come from the registry. */
const GROUPS: Array<{ title: string; paths: string[] }> = [
  {
    title: "Preferences",
    paths: ["/settings/general", "/settings/reconciliation", "/settings/investments"],
  },
  {
    title: "Connections",
    paths: ["/settings/integrations", "/settings/developer", "/settings/about"],
  },
];

/**
 * Grouped inset lists: icon tile, label, chevron-right. Tapping a row opens the detail page. A centred
 * column (max-w-xl); from wide, two columns when there are groups.
 */
export function SettingsHub() {
  const columnCurrent = useColumnCurrent();
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
    <div className="w-full space-y-6">
      <PageHeader title="Settings" />
      <div
        data-slot="settings-hub-columns"
        className={cn(
          "grid grid-cols-1 items-start gap-6",
          // columns follow the group count (1 -> 1, 2 -> 2, 3+ -> 3) so the cards always fill the width
          // wide: column 2 of the cascading columns (column-nav.tsx), always one list column
          groups.length === 2 && "regular:grid-cols-2 wide:grid-cols-1",
          groups.length >= 3 && "regular:grid-cols-2 wide:grid-cols-1",
        )}
      >
        {groups.map((group) => (
          <section key={group.title} data-slot="settings-hub-group" className="space-y-2">
            <div className="@container [&>*:not(:last-child)]:shadow-[var(--list-divider)] overflow-hidden rounded-2xl bg-card">
              <CardLabel as="h2" icon={groupLabelIcon(group.title).icon} tone={groupLabelIcon(group.title).tone}>
                {group.title}
              </CardLabel>
              {group.entries.map((entry) => {
                const Icon = entry.icon;
                return (
                  <Link
                    key={entry.path}
                    href={entry.path}
                    data-slot="settings-hub-row"
                    aria-current={isCurrentRoute(columnCurrent, entry.path) ? "true" : undefined}
                    className="flex min-h-14 aria-[current=true]:bg-primary/10 aria-[current=true]:hover:bg-primary/10 items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
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
    </div>
  );
}
