/**
 * Account hub page — iOS grouped list showing all account sections.
 * Rendered when FINLYNQ_NAV_V2 is enabled; otherwise the shell navigation is used.
 */

import { getEntriesBySurface } from "@/lib/nav-config";
import { ListRow } from "@/components/mobile/list-row";
import { SectionCard } from "@/components/mobile/section-card";

/**
 * Account hub: lists all account sections in one grouped view.
 * Order: Info, Security.
 */
export function AccountHub() {
  const entries = getEntriesBySurface("account");
  const order = [
    "/account/info",
    "/account/security",
  ];

  const orderedEntries = order
    .map((path) => entries.find((e) => e.path === path))
    .filter(Boolean);

  if (orderedEntries.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-muted-foreground">
        No account settings available.
      </div>
    );
  }

  return (
    <div className="space-y-4 px-4 py-6">
      <SectionCard label="Account">
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
