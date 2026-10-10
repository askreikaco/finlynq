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
 *
 * Variants (all optional; omitted = the default look above, unchanged):
 *  - look="card": plain rounded card group with divider rows (settings hub, portfolio/new).
 *  - sectionLabel, columns, width, padBottom, back, useRedirect, outerSuspense: layout and chrome.
 *  - iconSize, chevronSize, activeBg, rowSlot, iconSlot, chevronSlot: card look only.
 *    groupSlot and `description` on a row apply in both looks.
 */

import * as React from "react";
import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { getEntriesBySurface, type Surface } from "@/lib/nav-config";
import { cn } from "@/lib/utils";
import { TW } from "@/lib/design/tokens";
import { PageHeader } from "@/components/mobile/page-header";
import { InsetGroup, InsetRow, InsetSectionHeader } from "@/components/mobile/inset-group";
import { SectionLabel } from "@/components/mobile/section-label";

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
  /** "inset" (default): InsetGroup rows. "card": rounded card group with divider rows. */
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
  /** Card look: icon size. "4" (default) = size-4; "18px" = size-[18px]. */
  iconSize?: "4" | "18px";
  /** Card look: chevron size. "4" (default) = size-4; "5" = size-5. */
  chevronSize?: "4" | "5";
  /** Card look: add `active:bg-muted` to link and button rows. */
  activeBg?: boolean;
  /** data-slot on each group (default "hub-group"). Both looks. */
  groupSlot?: string;
  /** Card look: data-slot on each row. */
  rowSlot?: string;
  /** Card look: data-slot on the icon tile. */
  iconSlot?: string;
  /** Card look: data-slot on the chevron. */
  chevronSlot?: string;
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

function renderSectionLabel(title: string, style: NonNullable<HubPageVariants["sectionLabel"]>) {
  if (style === "caps") {
    return (
      <h2 data-slot="hub-section-label" className="px-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
    );
  }
  if (style === "section-label") return <SectionLabel>{title}</SectionLabel>;
  return <InsetSectionHeader>{title}</InsetSectionHeader>;
}

interface CardRowOptions {
  id: string;
  iconSize: NonNullable<HubPageVariants["iconSize"]>;
  chevronSize: NonNullable<HubPageVariants["chevronSize"]>;
  activeBg: boolean;
  rowSlot?: string;
  iconSlot?: string;
  chevronSlot?: string;
}

function renderCardRow(row: HubRow, o: CardRowOptions) {
  const interactive = Boolean(row.href) || Boolean(row.onClick);
  const showChevron = interactive && !row.destructive;
  const Icon = row.icon;
  const tone = row.destructive ? "text-destructive" : row.accent ? "text-primary" : "text-foreground";
  const content = (
    <>
      {Icon ? (
        <span
          data-slot={o.iconSlot}
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-lg",
            row.destructive ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary",
          )}
        >
          <Icon className={o.iconSize === "18px" ? "size-[18px]" : "size-4"} aria-hidden />
        </span>
      ) : null}
      {row.description !== undefined ? (
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate text-base", tone)}>{row.label}</span>
          <span className="block truncate text-xs text-muted-foreground">{row.description}</span>
        </span>
      ) : (
        <span className={cn("min-w-0 flex-1 truncate text-base", tone)}>{row.label}</span>
      )}
      {row.value !== undefined && row.value !== null && row.value !== "" ? (
        <span className="shrink-0 text-base text-muted-foreground">{row.value}</span>
      ) : null}
      {row.badge !== undefined && row.badge > 0 ? (
        <span className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-xs font-semibold leading-none text-primary-foreground">
          {row.badge}
        </span>
      ) : null}
      {showChevron ? (
        <ChevronRight
          data-slot={o.chevronSlot}
          aria-hidden
          className={cn(o.chevronSize === "5" ? "size-5" : "size-4", "shrink-0 text-muted-foreground")}
        />
      ) : null}
    </>
  );
  const rowCls = cn(
    "flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50",
    o.activeBg && "active:bg-muted",
    "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
    row.disabled && "pointer-events-none opacity-50",
  );
  const testId = `${o.id}-row-${row.id}`;
  if (row.href) {
    return (
      <Link
        key={row.id}
        href={row.href}
        data-slot={o.rowSlot}
        data-testid={testId}
        aria-disabled={row.disabled ? "true" : undefined}
        className={rowCls}
      >
        {content}
      </Link>
    );
  }
  if (row.onClick) {
    return (
      <button
        key={row.id}
        type="button"
        data-slot={o.rowSlot}
        data-testid={testId}
        onClick={row.onClick}
        disabled={row.disabled}
        className={cn(rowCls, "w-full text-left")}
      >
        {content}
      </button>
    );
  }
  return (
    <div key={row.id} data-slot={o.rowSlot} data-testid={testId} className={rowCls}>
      {content}
    </div>
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
    columns = 1,
    width = "section",
    padBottom = true,
    back,
    iconSize = "4",
    chevronSize = "4",
    activeBg = false,
    groupSlot,
    rowSlot,
    iconSlot,
    chevronSlot,
  } = props;
  const groups = props.groups ?? groupsFromSurface(props.surface, props.order);
  const hasRows = groups.some((g) => g.rows.length > 0);

  if (redirected) return null;

  const rootWidth = width === "form-report" ? `${TW.form} wide:${TW.report}` : TW.section;
  const cardOpts: CardRowOptions = { id, iconSize, chevronSize, activeBg, rowSlot, iconSlot, chevronSlot };

  const groupNodes = groups.map((group) => (
    <section
      key={group.id}
      data-slot={groupSlot ?? "hub-group"}
      data-testid={`${id}-group-${group.id}`}
      className="space-y-2"
    >
      {group.title ? renderSectionLabel(group.title, sectionLabel) : null}
      {look === "card" ? (
        <div className="divide-y divide-border/50 overflow-hidden rounded-group bg-card">
          {group.rows.map((row) => renderCardRow(row, cardOpts))}
        </div>
      ) : (
        <InsetGroup aria-label={group.title}>
          {group.rows.map((row) => (
            <InsetRow
              key={row.id}
              label={
                row.description !== undefined ? (
                  <>
                    <span className="block truncate">{row.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">{row.description}</span>
                  </>
                ) : (
                  row.label
                )
              }
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
      )}
    </section>
  ));

  return (
    <div
      data-testid={`${id}-root`}
      data-slot="hub-page"
      className={cn("mx-auto w-full space-y-6", rootWidth, padBottom ? TW.formPad : undefined, className)}
    >
      <PageHeader title={title} backHref={back?.href} backLabel={back?.label} />
      <React.Suspense fallback={null}>
        {header ? <div data-slot="hub-header">{header}</div> : null}
        {columns === "wide-2" ? (
          <div data-slot="hub-columns" className="grid gap-6 wide:grid-cols-2">
            {groupNodes}
          </div>
        ) : (
          groupNodes
        )}
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
