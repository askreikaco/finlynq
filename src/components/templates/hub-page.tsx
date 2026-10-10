"use client";

/**
 * HubPage template (C-09): an iOS grouped-list hub. Owns the root testid (`<id>-root`), the
 * global PageHeader, the width token (TW.section), the bottom pad (TW.formPad) and the
 * Suspense boundary. Rows render with InsetGroup and InsetRow from mobile/inset-group.tsx.
 *
 * Groups come from one of two sources (exactly one):
 *  - `groups`: an explicit list.
 *  - `surface` + `order`: rows from getEntriesBySurface(surface), in the order given by `order`.
 *    Unknown paths and groups left with no rows are dropped.
 */

import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { getEntriesBySurface, type Surface } from "@/lib/nav-config";
import { cn } from "@/lib/utils";
import { TW } from "@/lib/design/tokens";
import { PageHeader } from "@/components/mobile/page-header";
import { InsetGroup, InsetRow, InsetSectionHeader } from "@/components/mobile/inset-group";

export interface HubRow {
  id: string;
  label: string;
  href?: string;
  onClick?: () => void;
  icon?: LucideIcon;
  value?: React.ReactNode;
  badge?: number;
  accent?: boolean;
  destructive?: boolean;
  disabled?: boolean;
}

export interface HubGroup {
  id: string;
  title?: string;
  rows: HubRow[];
}

/** One group of a registry-driven hub: its title and the nav paths it lists, in display order. */
export interface HubGroupOrder {
  id: string;
  title?: string;
  paths: string[];
}

/**
 * Build hub groups from the nav registry. Pure. Keeps the order of `order` and of `paths` within
 * each group. Paths not registered for `surface` are dropped; groups with no rows are dropped.
 */
export function groupsFromSurface(surface: Surface, order: HubGroupOrder[]): HubGroup[] {
  const entries = getEntriesBySurface(surface);
  return order
    .map((g) => ({
      id: g.id,
      title: g.title,
      rows: g.paths
        .map((path) => entries.find((e) => e.path === path))
        .filter((e): e is NonNullable<typeof e> => Boolean(e))
        .map((e) => ({ id: e.id, label: e.label, href: e.path, icon: e.icon })),
    }))
    .filter((g) => g.rows.length > 0);
}

interface HubPageBase {
  id: string;
  title: React.ReactNode;
  /** Rendered between the header and the groups, e.g. an account card. */
  header?: React.ReactNode;
  /** Rendered after the groups. */
  footer?: React.ReactNode;
  /** Rendered when there are no rows at all. */
  empty?: React.ReactNode;
  className?: string;
}

export type HubPageProps = HubPageBase &
  (
    | { groups: HubGroup[]; surface?: undefined; order?: undefined }
    | { surface: Surface; order: HubGroupOrder[]; groups?: undefined }
  );

export function HubPage(props: HubPageProps) {
  const { id, title, header, footer, empty, className } = props;
  const groups = props.groups ?? groupsFromSurface(props.surface, props.order);
  const hasRows = groups.some((g) => g.rows.length > 0);

  return (
    <div
      data-testid={`${id}-root`}
      data-slot="hub-page"
      className={cn("mx-auto w-full space-y-6", TW.section, TW.formPad, className)}
    >
      <PageHeader title={title} />
      <React.Suspense fallback={null}>
        {header ? <div data-slot="hub-header">{header}</div> : null}
        {groups.map((group) => (
          <section
            key={group.id}
            data-slot="hub-group"
            data-testid={`${id}-group-${group.id}`}
            className="space-y-2"
          >
            {group.title ? <InsetSectionHeader>{group.title}</InsetSectionHeader> : null}
            <InsetGroup aria-label={group.title}>
              {group.rows.map((row) => (
                <InsetRow
                  key={row.id}
                  label={row.label}
                  icon={row.icon}
                  value={row.value}
                  badge={row.badge}
                  href={row.href}
                  onClick={row.onClick}
                  accent={row.accent}
                  destructive={row.destructive}
                  disabled={row.disabled}
                  data-testid={`${id}-row-${row.id}`}
                />
              ))}
            </InsetGroup>
          </section>
        ))}
        {!hasRows && empty ? <div data-slot="hub-empty">{empty}</div> : null}
        {footer ? <div data-slot="hub-footer">{footer}</div> : null}
      </React.Suspense>
    </div>
  );
}
