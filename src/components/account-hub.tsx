"use client";

/**
 * Account hub page: iOS grouped list showing all account sections (every size).
 */

import { User } from "lucide-react";
import { getEntriesBySurface } from "@/lib/nav-config";
import { ListRow } from "@/components/mobile/list-row";
import { TW } from "@/lib/design/tokens";
import { Card } from "@/components/ui/card";

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
    <div data-slot="account-hub" className={`${TW.grid3} px-4 py-6`}>
      <Card title="Account" icon={User} tone="indigo" padded={false}>
        <div className="[&>*:not(:last-child)]:shadow-[var(--list-divider)]">
          {orderedEntries.map((entry) => (
            entry && (
              <ListRow
                key={entry.path}
                title={entry.label}
                icon={entry.icon}
                href={entry.path}
              />
            )
          ))}
        </div>
      </Card>
    </div>
  );
}
