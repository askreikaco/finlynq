/**
 * Settings hub page — iOS grouped list showing all settings sections.
 * Rendered when FINLYNQ_NAV_V2 is enabled; otherwise the shell navigation is used.
 */

import { getEntriesBySurface } from "@/lib/nav-config";
import { ListRow } from "@/components/mobile/list-row";
import { SectionCard } from "@/components/mobile/section-card";

/**
 * Settings hub: lists all settings sections in one grouped view.
 * No grouping by label (all in Settings group per nav-config);
 * ordered as: General, Categories, Reconciliation, Investments, Integrations, Developer, About.
 */
export function SettingsHub() {
  const entries = getEntriesBySurface("settings");
  const order = [
    "/settings/general",
    "/settings/categorization",
    "/settings/reconciliation",
    "/settings/investments",
    "/settings/integrations",
    "/settings/developer",
    "/settings/about",
  ];

  const orderedEntries = order
    .map((path) => entries.find((e) => e.path === path))
    .filter(Boolean);

  if (orderedEntries.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-muted-foreground">
        No settings available.
      </div>
    );
  }

  return (
    <div className="space-y-4 px-4 py-6">
      <SectionCard label="Settings">
        <div className="divide-y divide-border/50">
          {orderedEntries.map((entry) => (
            entry && (
              <ListRow
                key={entry.path}
                title={entry.label}
                icon={entry.icon}
                href={entry.path}
                className="py-3"
              />
            )
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
