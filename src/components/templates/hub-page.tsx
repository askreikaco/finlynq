"use client";

/**
 * HubPage template (C-09): an iOS grouped-list hub. Owns the root testid (`<id>-root`), the
 * global PageHeader, the width token (TW.section), the bottom pad (TW.formPad) and the
 * Suspense boundary. Every row is the shared ListRow (mobile/list-row.tsx).
 *
 * Groups come from one of two sources (exactly one):
 *  - `groups`: an explicit list.
 *  - `surface` + `order`: rows from getEntriesBySurface(surface), in the order given by `order`.
 *    Unknown paths and groups left with no rows are dropped.
 *
 * Variants (all optional; omitted = the default look above, unchanged):
 *  - look="card": plain rounded card group instead of the inset group (settings hub, portfolio/new).
 *  - sectionLabel, columns, width, padBottom, back, useRedirect, outerSuspense: layout and chrome.
 *  - groupSlot and `description` on a row apply in both looks.
 */

import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { getEntriesBySurface, type Surface } from "@/lib/nav-config";
import { cn } from "@/lib/utils";
import { TW } from "@/lib/design/tokens";
import { PageHeader } from "@/components/mobile/page-header";
import { InsetGroup } from "@/components/mobile/inset-group";
import { ListRow } from "@/components/mobile/list-row";
import { CardLabel } from "@/components/mobile/card-label";
import { groupLabelIcon } from "@/components/mobile/group-label-icon";

export interface HubRow {
  id: string;
  label: string;
  /** Muted second line under the label (card look and inset look). */
  description?: React.ReactNode;
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

/** Optional look and layout variants. Every field is optional; omitted = today's behaviour. */
export interface HubPageVariants {
  /** "inset" (default): InsetGroup container. "card": plain rounded card container. */
  look?: "inset" | "card";
  /** Group heading style. "inset" (default) = InsetSectionHeader; "caps" = small uppercase h2; "section-label" = SectionLabel. */
  sectionLabel?: "inset" | "caps" | "section-label";
  /** 1 (default) = groups stacked. "wide-2" = two columns from the `wide` breakpoint. */
  columns?: 1 | "wide-2";
  /** "section" (default) = TW.section. "form-report" = max-w-form, widening to max-w-report from `wide`. */
  width?: "section" | "form-report";
  /** Default true = TW.formPad bottom padding on the root. false = none. */
  padBottom?: boolean;
  /** Back button in the header (passed to PageHeader backHref/backLabel). Omitted = PageHeader default. */
  back?: { href: string; label?: string };
  /** Hook run inside the root. true = render null (e.g. a legacy `?op=` redirect). */
  useRedirect?: () => boolean;
  /** Wrap the whole hub in its own Suspense boundary (for hooks such as useSearchParams). */
  outerSuspense?: boolean;
  /** data-slot on each group (default "hub-group"). */
  groupSlot?: string;
}

interface HubPageBase extends HubPageVariants {
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

function useNoRedirect(): boolean {
  return false;
}

/** Group title: always rendered INSIDE the group card as its first row (shared CardLabel: icon tile + uppercase label). */
function renderSectionLabel(title: string, style: NonNullable<HubPageVariants["sectionLabel"]>) {
  const { icon, tone } = groupLabelIcon(title);
  return (
    <CardLabel as="h2" slot={style === "caps" ? "hub-section-label" : "section-label"} icon={icon} tone={tone}>
      {title}
    </CardLabel>
  );
}

/** One hub row: maps a HubRow to ListRow props (no layout of its own). */
function HubRowView({ row, id }: { row: HubRow; id: string }) {
  return (
    <ListRow
      title={row.label}
      subtitle={row.description}
      icon={row.icon}
      tile="primary"
      tone={row.destructive ? "destructive" : row.accent ? "accent" : "default"}
      value={row.value !== undefined && row.value !== null && row.value !== "" ? row.value : undefined}
      quietValue
      unread={row.badge}
      href={row.href}
      onPress={row.onClick}
      disabled={row.disabled}
      data-testid={`${id}-row-${row.id}`}
    />
  );
}

function HubPageBody(props: HubPageProps) {
  const useRedirectHook = props.useRedirect ?? useNoRedirect;
  const redirected = useRedirectHook();
  const {
    id,
    title,
    header,
    footer,
    empty,
    className,
    look = "inset",
    sectionLabel = "inset",
    padBottom = true,
    back,
    groupSlot,
  } = props;
  const groups = props.groups ?? groupsFromSurface(props.surface, props.order);
  const hasRows = groups.some((g) => g.rows.length > 0);

  if (redirected) return null;

  // Full width on desktop (owner 2026-10-13); `width` is kept for call sites.
  const groupNodes = groups.map((group) => (
    <section
      key={group.id}
      data-slot={groupSlot ?? "hub-group"}
      data-testid={`${id}-group-${group.id}`}
      className="space-y-2"
    >
      {look === "card" ? (
        <div className="@container [&>*:not(:last-child)]:shadow-[var(--list-divider)] overflow-hidden rounded-group bg-card">
          {group.title ? renderSectionLabel(group.title, sectionLabel) : null}
          {group.rows.map((row) => (
            <HubRowView key={row.id} row={row} id={id} />
          ))}
        </div>
      ) : (
        <InsetGroup aria-label={group.title} header={group.title} className="[&>*:not(:last-child)]:shadow-[var(--list-divider)]">
          {group.rows.map((row) => (
            <HubRowView key={row.id} row={row} id={id} />
          ))}
        </InsetGroup>
      )}
    </section>
  ));

  return (
    <div
      data-testid={`${id}-root`}
      data-slot="hub-page"
      className={cn("w-full space-y-6", padBottom ? TW.formPad : undefined, className)}
    >
      <PageHeader title={title} backHref={back?.href} backLabel={back?.label} />
      <React.Suspense fallback={null}>
        {header ? <div data-slot="hub-header">{header}</div> : null}
        <div data-slot="hub-columns" className={TW.grid3}>
          {groupNodes}
        </div>
        {!hasRows && empty ? <div data-slot="hub-empty">{empty}</div> : null}
        {footer ? <div data-slot="hub-footer">{footer}</div> : null}
      </React.Suspense>
    </div>
  );
}

export function HubPage(props: HubPageProps) {
  if (props.outerSuspense) {
    return (
      <React.Suspense fallback={null}>
        <HubPageBody {...props} />
      </React.Suspense>
    );
  }
  return <HubPageBody {...props} />;
}
