"use client";

import * as React from "react";
import Link from "next/link";
import { Check, Filter, ListChecks, Loader2, MoreHorizontal, Pencil, Plus, Settings, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { RoundIconButton } from "@/components/ui/round-icon-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BackButton } from "./back-button";
import { useBackTarget } from "@/components/adaptive/use-back-target";
import { usePageCustomizeRegistration } from "./page-customize";
import { FilterButton } from "@/components/page-toolbar";
import { InfoTip } from "@/components/ui/info-tip";

/**
 * THE top bar (owner 2026-10-15: one component, one anatomy, every page). Fixed order, left to right:
 *
 *   [BACK] [TITLE (i)] ............ [secondary: MORE + FILTER-or-BULK-EDIT (max 2)] [PRIMARY: Add / Edit / Save]
 *
 * Every slot is a typed prop; there is no children / actions node, so a page cannot lay the bar out itself.
 * Title is required. Back is automatic (nav registry parent, a valid ?returnTo=) on level 2+ routes and absent on
 * root destinations; `back` overrides the target, `back={false}` forces a root bar. The (i) tooltip is `info`.
 * No subtitle, no icon above the title, no top border (owner rules 2026-10-13/14).
 */

/** One entry of the More (⋯) menu. */
export interface MoreItem {
  label: string;
  icon?: LucideIcon;
  /** Optional grey second line under the label (e.g. a branch name). */
  description?: string;
  onSelect?: () => void;
  href?: string;
  disabled?: boolean;
  destructive?: boolean;
}

interface PrimaryCommon {
  /** Accessible name of the round icon button (the bar shows the icon only). */
  label: string;
  disabled?: boolean;
  testId?: string;
}

/**
 * The ONE primary action: a yellow round 44px button, always rightmost. `kind` picks the icon (add = plus, edit =
 * pencil, save = check). Exactly one of: a link (`href`, optional `onSelect` that intercepts the click, e.g. to open
 * the split-view pane), a button (`onSelect`), or - for `save` - a submit of the form with id `form`.
 */
export type TopBarPrimary =
  | (PrimaryCommon & { kind: "add" | "edit"; href: string; onSelect?: () => void })
  | (PrimaryCommon & { kind: "add" | "edit"; onSelect: () => void; href?: undefined })
  | (PrimaryCommon & { kind: "save"; onSelect: () => void; form?: undefined; busy?: boolean })
  | (PrimaryCommon & { kind: "save"; form: string; onSelect?: undefined; busy?: boolean });

/** Back target. `href` (a link; browser-back when the user navigated inside the app) or `onBack` (a button). */
export type TopBarBack = { href: string; label?: string } | { onBack: () => void; label?: string };

export interface PageHeaderProps {
  /** Page title, one line. Required. */
  title: string;
  /** Help for the page: shown ONLY in the (i) tooltip right after the title, never as a visible line. One short sentence. */
  info?: React.ReactNode;
  /**
   * Back control. Omitted = automatic: a back button to the parent route on level 2+ pages, none on a root page.
   * An object sets the target; `false` = this page is a root destination (no back).
   */
  back?: TopBarBack | false;
  /** Primary action (rightmost, yellow): Add / Edit / Save. At most one. */
  primary?: TopBarPrimary;
  /** More (⋯) menu items. The Customize-cards action (usePageCustomize) is always appended by the bar. */
  more?: MoreItem[];
  /**
   * Filter: opens the page's filter + sort page. The secondary group is [More][bulk edit OR Filter]; with a `bulkEdit`
   * the Filter entry moves INSIDE More. Max two secondary buttons, ever.
   */
  filter?: { href: string | (() => string); activeCount?: number };
  /** Bulk-edit / select-mode toggle for lists (icon button, aria-label `label`, default "Edit list"). */
  bulkEdit?: { onToggle: () => void; active?: boolean; label?: string };
}

/**
 * Sticky, full-bleed glass bar (globals.css .glass-bar / .page-header-bleed), three-column grid
 * [back | title | actions]: the side tracks size to their content, so the title can never run under the actions.
 * z-30 above section labels (z-10), below the rail (z-50). ONE position class (sticky): cn()/twMerge drops sticky if a
 * relative/absolute/fixed class is merged in. No pt-[var(--sat)]: body already pads its in-flow top by --sat.
 */
export const PHONE_BAR =
  "glass-bar sticky top-[var(--sat,0px)] z-30 page-header-bleed grid min-h-[var(--phone-header-h)] shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] gap-x-2 items-center";

function PrimaryAction({ primary }: { primary: TopBarPrimary }) {
  const Icon = primary.kind === "save" ? Check : primary.kind === "edit" ? Pencil : Plus;
  const busy = primary.kind === "save" && primary.busy === true;
  const common = {
    "aria-label": primary.label,
    "data-slot": "topbar-primary",
    "data-kind": primary.kind,
    "data-testid": primary.testId,
  } as const;
  const icon = busy ? <Loader2 className="animate-spin" aria-hidden /> : <Icon aria-hidden />;
  if ("href" in primary && primary.href !== undefined) {
    const { href, onSelect } = primary;
    return (
      <Button
        {...common}
        render={<Link href={href} />}
        onClick={
          onSelect
            ? (e: React.MouseEvent) => {
                e.preventDefault();
                onSelect();
              }
            : undefined
        }
      >
        {icon}
      </Button>
    );
  }
  if (primary.kind === "save" && "form" in primary && primary.form !== undefined) {
    return (
      <Button {...common} type="submit" form={primary.form} disabled={primary.disabled || busy}>
        {icon}
      </Button>
    );
  }
  return (
    <Button {...common} type="button" disabled={primary.disabled || busy} onClick={primary.onSelect}>
      {icon}
    </Button>
  );
}

/** The "⋯" menu: the bar's More button, and the title row of a split-view pane (which has no bar). */
export function MoreActionsMenu({ items }: { items: MoreItem[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<RoundIconButton aria-label="More actions" data-slot="overflow-trigger" />}>
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {items.map((it) => {
          const Icon = it.icon;
          return (
            <DropdownMenuItem
              key={it.label}
              disabled={it.disabled}
              variant={it.destructive ? "destructive" : "default"}
              icon={Icon ? <Icon aria-hidden /> : undefined}
              description={it.description}
              onClick={it.onSelect}
              {...(it.href ? { render: <Link href={it.href} /> } : {})}
            >
              {it.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BackSlot({ back }: { back: TopBarBack | false | undefined }) {
  // Automatic target: the nav registry parent (or a valid ?returnTo=) on a level 2+ route.
  const auto = useBackTarget();
  if (back === false) return null;
  const spec: TopBarBack | null = back ?? (auto && auto.level >= 2 ? (auto.href ? { href: auto.href } : { onBack: () => window.history.back() }) : null);
  if (!spec) return null;
  if ("onBack" in spec) {
    return <BackButton onClick={spec.onBack} label={spec.label} className="justify-self-start" />;
  }
  return (
    <BackButton
      href={spec.href}
      label={spec.label}
      // Hidden by CSS at wide inside the cascading columns (column-nav.tsx) when it only leads to a visible column.
      className={cn("justify-self-start", spec.href === "/more" || spec.href === "/settings" ? "column-auto-back" : null)}
    />
  );
}

export function PageHeader({ title, info, back, primary, more, filter, bulkEdit }: PageHeaderProps) {
  // Set by a page with cards (usePageCustomize): the Customize button joins the More menu, last.
  const customize = usePageCustomizeRegistration();
  const moreItems: MoreItem[] = [
    ...(bulkEdit && filter
      ? [{ label: "Filter", icon: Filter, href: typeof filter.href === "function" ? filter.href() : filter.href }]
      : []),
    ...(more ?? []),
    ...(customize ? [{ label: "Customize cards", icon: Settings, onSelect: customize.onOpen }] : []),
  ];
  const hasSecondary = moreItems.length > 0 || !!filter || !!bulkEdit;
  return (
    <div data-slot="page-header" className={PHONE_BAR}>
      <BackSlot back={back} />
      <div
        data-slot="page-header-title-block"
        // pointer-events-none: taps reach the buttons; the (i) tip re-enables its own.
        className="col-start-2 row-start-1 flex min-w-0 items-center justify-start gap-1 text-left pointer-events-none"
      >
        <h1 data-slot="page-header-title" className="max-w-full truncate text-left text-base font-semibold tracking-normal">
          {title}
        </h1>
        {info ? <InfoTip text={info} label={`About ${title}`} side="bottom" /> : null}
      </div>
      {hasSecondary || primary ? (
        <div
          data-slot="page-header-actions"
          className="col-start-3 row-start-1 flex min-w-0 shrink-0 flex-nowrap items-center justify-self-end gap-2"
        >
          {hasSecondary ? (
            <div
              data-slot="header-capsule"
              className="glass-capsule flex h-11 min-w-0 shrink-0 flex-nowrap items-center gap-0 rounded-full p-0"
            >
              {moreItems.length > 0 ? <MoreActionsMenu items={moreItems} /> : null}
              {bulkEdit ? (
                <RoundIconButton
                  type="button"
                  aria-label={bulkEdit.label ?? "Edit list"}
                  aria-pressed={bulkEdit.active ?? false}
                  data-slot="bulk-edit-trigger"
                  onClick={bulkEdit.onToggle}
                >
                  <ListChecks className="size-4" aria-hidden />
                </RoundIconButton>
              ) : filter ? (
                <FilterButton {...filter} variant="outline" />
              ) : null}
            </div>
          ) : null}
          {primary ? <PrimaryAction primary={primary} /> : null}
        </div>
      ) : null}
    </div>
  );
}
